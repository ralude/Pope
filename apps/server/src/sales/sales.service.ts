import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type Actor,
  type CashMovement,
  type CashShift,
  lineTotal,
  type Micros,
  micros,
  newId,
  OTHER_INCOME_NAME,
  otherIncomeLabel,
  saleGroupTotals,
  type SaleRequest,
} from '@pope/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { CashRegisterService, paymentsOf } from '../cash/cash-register.service.js';
import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import {
  cashShifts,
  customers,
  ledger,
  products,
  saleLines,
  sales,
  stockMovements,
} from '../db/schema.js';
import { EventsService, type Transaction } from '../events/events.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { InsufficientBalanceError, WalletService } from '../wallet/wallet.service.js';

/**
 * Una línea ya resuelta: con el nombre y el precio del momento. Un otro ingreso no tiene id
 * y lleva su comentario (REQ-005-05).
 */
type ResolvedLine =
  | {
      kind: 'product';
      id: string;
      name: string;
      quantity: number;
      unitPriceMicros: Micros;
      totalMicros: Micros;
    }
  | {
      kind: 'other';
      name: typeof OTHER_INCOME_NAME;
      quantity: 1;
      unitPriceMicros: Micros;
      totalMicros: Micros;
      comment: string | null;
    };

/**
 * "Doritos × 2, Otro ingreso · 20 impresiones": cómo se lee una venta en la lista y en el
 * reporte.
 */
export function saleDescription(
  lines: readonly (
    { name: string; quantity: number } | { kind: 'other'; comment: string | null }
  )[],
): string {
  return lines
    .map((line) =>
      'comment' in line
        ? otherIncomeLabel(line.comment)
        : `${line.name} × ${String(line.quantity)}`,
    )
    .join(', ');
}

/** Una línea en `sale.recorded` v2. */
function recordedLine(line: ResolvedLine) {
  const total = { micros: line.totalMicros, currency: 'USD' as const };
  return line.kind === 'product'
    ? {
        kind: 'product' as const,
        id: line.id,
        name: line.name,
        quantity: line.quantity,
        unitPrice: { micros: line.unitPriceMicros, currency: 'USD' as const },
        total,
      }
    : { kind: 'other' as const, comment: line.comment, total };
}

/**
 * Ventas del mostrador (spec 005, REQ-005-20 a REQ-005-22, REQ-005-25): golosinas del
 * inventario y otros ingresos sin inventario, pagadas con uno o varios métodos, también con el
 * saldo de una cuenta. Todo en una transacción: la venta, sus líneas, el stock, el saldo, el
 * registro de caja y el evento.
 */
@Injectable()
export class SalesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly cash: CashRegisterService,
    private readonly wallet: WalletService,
    private readonly settings: SettingsService,
    private readonly clock: Clock,
  ) {}

  /**
   * Registra una venta en la caja abierta y emite `sale.recorded`. Responde 409 si falta
   * stock (salvo que el administrador lo permita, REQ-005-12), si un producto ya no está a
   * la venta, si el saldo no alcanza o si hay que cobrar en Bs sin tasa.
   */
  async record(input: SaleRequest, shift: CashShift, actor: Actor): Promise<CashMovement> {
    const allowNegative = (await this.settings.get()).allowNegativeStock === 1;
    const saleId = await this.events.inTransaction(async (tx, emit) => {
      const lines = await this.resolve(tx, input, allowNegative);
      const total = lines.reduce((sum, line) => sum + line.totalMicros, 0);
      const paid = input.payments.reduce((sum, payment) => sum + payment.usdMicros, 0);
      if (paid !== total) {
        throw new BadRequestException('Los pagos no suman el total de la venta');
      }
      const now = this.clock.now();
      const id = newId();
      await tx.insert(sales).values({
        id,
        shiftId: shift.id,
        customerId: input.customerId,
        totalMicros: total,
        actor,
        createdAt: now,
      });
      await tx.insert(saleLines).values(
        lines.map((line, position) => ({
          id: newId(),
          saleId: id,
          position,
          kind: line.kind,
          productId: line.kind === 'product' ? line.id : null,
          name: line.name,
          quantity: line.quantity,
          unitPriceMicros: line.unitPriceMicros,
          totalMicros: line.totalMicros,
          comment: line.kind === 'other' ? line.comment : null,
        })),
      );
      const productLines = lines.flatMap((line) => (line.kind === 'product' ? [line] : []));
      if (productLines.length > 0) {
        await tx.insert(stockMovements).values(
          productLines.map((line) => ({
            id: newId(),
            productId: line.id,
            kind: 'sale' as const,
            quantity: -line.quantity,
            saleId: id,
            actor,
            createdAt: now,
          })),
        );
      }
      const customer = await this.chargeBalance(tx, input, id, actor);
      const pieces = await this.cash.record(tx, {
        shiftId: shift.id,
        source: 'sale',
        sourceId: id,
        description: saleDescription(lines),
        groups: saleGroupTotals(lines),
        payments: input.payments,
        actor,
      });
      emit({
        type: 'sale.recorded',
        version: 2,
        actor,
        payload: {
          saleId: id,
          shiftId: shift.id,
          customer,
          lines: lines.map(recordedLine),
          payments: paymentsOf(pieces),
          total: { micros: micros(total), currency: 'USD' },
        },
      });
      return id;
    });
    const list = await this.cash.list(shift.id);
    const movement = list.movements.find((m) => m.source === 'sale' && m.sourceId === saleId);
    if (!movement) {
      throw new Error('No se pudo leer la venta registrada');
    }
    return movement;
  }

  /**
   * Anula una venta de la caja abierta (REQ-005-23, CA-005-11) y emite `sale.voided`. No borra
   * nada: marca la venta, devuelve el stock con movimientos `sale` positivos, escribe las filas
   * negativas del registro de caja y, si se pagó con saldo, lo devuelve a la cuenta. Responde
   * 409 si ya estaba anulada o si su caja ya se cerró.
   */
  async void(id: string, reason: string, actor: Actor): Promise<CashMovement> {
    const shiftId = await this.events.inTransaction(async (tx, emit) => {
      const [sale] = await tx.select().from(sales).where(eq(sales.id, id)).for('update');
      if (!sale) {
        throw new NotFoundException('No existe esa venta');
      }
      if (sale.voidedAt !== null) {
        throw new ConflictException('Esa venta ya está anulada');
      }
      // Bloquea la caja: no puede cerrarse mientras se anula una venta suya.
      const [shift] = await tx
        .select()
        .from(cashShifts)
        .where(eq(cashShifts.id, sale.shiftId))
        .for('update');
      if (shift?.closedAt !== null) {
        throw new ConflictException('Solo se anulan ventas de la caja abierta');
      }
      const now = this.clock.now();
      await tx
        .update(sales)
        .set({ voidedAt: now, voidReason: reason, voidedBy: actor })
        .where(eq(sales.id, id));
      const productLines = await tx
        .select()
        .from(saleLines)
        .where(and(eq(saleLines.saleId, id), eq(saleLines.kind, 'product')));
      if (productLines.length > 0) {
        await tx.insert(stockMovements).values(
          productLines.map((line) => ({
            id: newId(),
            productId: line.productId ?? '',
            kind: 'sale' as const,
            quantity: line.quantity,
            saleId: id,
            actor,
            createdAt: now,
          })),
        );
      }
      if (sale.customerId !== null) {
        // Lo que se cobró del saldo vuelve a la cuenta, con otro movimiento `sale`.
        const charged = await tx
          .select({ amount: ledger.amount })
          .from(ledger)
          .where(and(eq(ledger.saleId, id), eq(ledger.kind, 'sale')));
        const refund = -charged.reduce((sum, row) => sum + row.amount, 0);
        if (refund > 0) {
          await this.wallet.post(tx, {
            customerId: sale.customerId,
            wallet: 'money',
            amount: refund,
            kind: 'sale',
            saleId: id,
            actor,
          });
        }
      }
      await this.cash.reverseSale(tx, id, sale.shiftId, actor);
      emit({
        type: 'sale.voided',
        version: 1,
        actor,
        payload: { saleId: id, shiftId: sale.shiftId, reason },
      });
      return sale.shiftId;
    });
    const list = await this.cash.list(shiftId);
    const movement = list.movements.find((m) => m.source === 'void' && m.sourceId === id);
    if (!movement) {
      throw new Error('No se pudo leer la anulación');
    }
    return movement;
  }

  /**
   * Resuelve las líneas con el nombre y el precio del momento. Los productos se bloquean
   * (en orden, para no cruzarse con otra venta) mientras se comprueba su stock.
   */
  private async resolve(
    tx: Transaction,
    input: SaleRequest,
    allowNegative: boolean,
  ): Promise<ResolvedLine[]> {
    const productIds = [
      ...new Set(input.lines.flatMap((l) => (l.kind === 'product' ? [l.productId] : []))),
    ];
    const productRows =
      productIds.length === 0
        ? []
        : await tx
            .select()
            .from(products)
            .where(inArray(products.id, productIds))
            .orderBy(asc(products.id))
            .for('update');
    const productById = new Map(productRows.map((row) => [row.id, row]));

    const lines = input.lines.map((line): ResolvedLine => {
      if (line.kind === 'other') {
        return {
          kind: 'other',
          name: OTHER_INCOME_NAME,
          quantity: 1,
          unitPriceMicros: line.usdMicros,
          totalMicros: line.usdMicros,
          comment: line.comment,
        };
      }
      const product = productById.get(line.productId);
      if (!product) {
        throw new NotFoundException('No existe ese producto');
      }
      if (!product.active) {
        throw new ConflictException(`${product.name} ya no está a la venta`);
      }
      const unitPriceMicros = micros(product.priceMicros);
      return {
        kind: 'product',
        id: product.id,
        name: product.name,
        quantity: line.quantity,
        unitPriceMicros,
        totalMicros: lineTotal(line.quantity, unitPriceMicros),
      };
    });

    if (!allowNegative && productIds.length > 0) {
      const stock = await tx
        .select({
          productId: stockMovements.productId,
          stock: sql<number>`sum(${stockMovements.quantity})`.mapWith(Number),
        })
        .from(stockMovements)
        .where(inArray(stockMovements.productId, productIds))
        .groupBy(stockMovements.productId);
      const available = new Map(stock.map((row) => [row.productId, row.stock]));
      for (const id of productIds) {
        const wanted = lines
          .filter((line) => line.kind === 'product' && line.id === id)
          .reduce((sum, line) => sum + line.quantity, 0);
        const left = available.get(id) ?? 0;
        if (wanted > left) {
          const name = productById.get(id)?.name ?? '';
          throw new ConflictException(
            `No hay suficiente ${name}: quedan ${String(Math.max(left, 0))}`,
          );
        }
      }
    }
    return lines;
  }

  /**
   * Cobra del saldo de la cuenta la parte pagada con saldo (REQ-005-21, CA-005-10), con un
   * movimiento `sale` del ledger. Devuelve la cuenta para el evento, o `null` si no paga con
   * saldo.
   */
  private async chargeBalance(
    tx: Transaction,
    input: SaleRequest,
    saleId: string,
    actor: Actor,
  ): Promise<{ id: string; username: string } | null> {
    const payment = input.payments.find((p) => p.method === 'balance');
    if (!payment || input.customerId === null) {
      return null;
    }
    const [customer] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, input.customerId))
      .for('update');
    if (!customer) {
      throw new NotFoundException('No existe ese cliente');
    }
    if (customer.status !== 'active') {
      const state = customer.status === 'blocked' ? 'bloqueada' : 'desactivada';
      throw new ConflictException(`La cuenta está ${state}: no puede pagar con su saldo`);
    }
    if ((await this.wallet.liveMoney(customer.id, tx)) < payment.usdMicros) {
      throw new InsufficientBalanceError();
    }
    await this.wallet.post(tx, {
      customerId: customer.id,
      wallet: 'money',
      amount: 0 - payment.usdMicros,
      kind: 'sale',
      saleId,
      actor,
    });
    return { id: customer.id, username: customer.username };
  }
}
