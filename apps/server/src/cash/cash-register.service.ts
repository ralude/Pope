import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  type CashGroup,
  type CashMethod,
  type CashMovement,
  type CashMovementLine,
  type CashPiece,
  type CashSource,
  cashTotals,
  type Currency,
  type Micros,
  methodCurrency,
  micros,
  newId,
  otherIncomeLabel,
  type PaymentMethod,
  type ShiftEntriesResponse,
  splitPayments,
  type VesRate,
  vesRate,
} from '@pope/shared';
import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { cashEntries, saleLines, sales } from '../db/schema.js';
import type { Transaction } from '../events/events.service.js';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service.js';
import { actorName } from '../sessions/session-state.js';

/** Sin tasa no se cobra en bolívares (REQ-005-34, plan 005). */
export const NO_RATE_MESSAGE =
  'No hay tasa de cambio: cobra en efectivo USD o escribe la tasa del día';

/** Un cobro que entra en la caja. */
export interface CashCharge {
  shiftId: string;
  source: CashSource;
  sourceId: string;
  /** Qué fue, como se leerá en la lista y en el reporte. */
  description: string;
  /** La cuenta del cobro, si la hay (REQ-005-24). */
  customerName: string | null;
  /** Lo que se cobra en cada grupo del reporte, en µUSD. */
  groups: readonly { group: CashGroup; usdMicros: Micros }[];
  /** Cómo se paga, en µUSD por método; deben sumar lo mismo que los grupos. */
  payments: readonly { method: CashMethod; usdMicros: Micros }[];
  actor: Actor;
}

/** Un pago tal como va en los eventos: por método, con su moneda, importe y tasa. */
export interface PaymentSummary {
  method: CashMethod;
  amount: { micros: Micros; currency: Currency };
  usd: { micros: Micros; currency: 'USD' };
  vesRate: VesRate | null;
}

/** Junta las filas de un cobro por método, en el orden en que aparecen (para los eventos). */
export function paymentsOf(pieces: readonly CashPiece[]): PaymentSummary[] {
  const byMethod = new Map<CashMethod, PaymentSummary>();
  for (const piece of pieces) {
    const current = byMethod.get(piece.method);
    if (current) {
      current.amount.micros = micros(current.amount.micros + piece.amountMicros);
      current.usd.micros = micros(current.usd.micros + piece.usdMicros);
    } else {
      byMethod.set(piece.method, {
        method: piece.method,
        amount: { micros: piece.amountMicros, currency: piece.currency },
        usd: { micros: piece.usdMicros, currency: 'USD' },
        vesRate: piece.vesRate,
      });
    }
  }
  return [...byMethod.values()];
}

type EntryRow = typeof cashEntries.$inferSelect;

/** Los movimientos de una caja con sus totales; el controlador añade quién la abrió. */
export type CashList = Pick<ShiftEntriesResponse, 'shiftId' | 'movements' | 'totals'>;

/**
 * Registro único de lo cobrado (spec 005, REQ-005-24): cada cobro en caja escribe aquí sus
 * filas en la misma transacción. De él salen la lista del turno, lo esperado al cerrar y los
 * reportes.
 */
@Injectable()
export class CashRegisterService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly rates: ExchangeRatesService,
    private readonly clock: Clock,
  ) {}

  /**
   * Anota un cobro: una fila por pago y grupo, con el importe en Bs a la tasa vigente si el
   * método es de Bs (REQ-005-22). Responde 409 si hay que cobrar en Bs y no hay tasa; como
   * corre dentro de la transacción del cobro, entonces no se guarda nada.
   */
  async record(tx: Transaction, charge: CashCharge): Promise<CashPiece[]> {
    const current = this.rates.current();
    const rate = current === null ? null : vesRate(current.vesPerUsd);
    if (rate === null && charge.payments.some((p) => methodCurrency(p.method) === 'VES')) {
      throw new ConflictException(NO_RATE_MESSAGE);
    }
    const pieces = splitPayments(charge.groups, charge.payments, rate);
    const now = this.clock.now();
    await tx.insert(cashEntries).values(
      pieces.map((piece) => ({
        id: newId(),
        shiftId: charge.shiftId,
        source: charge.source,
        sourceId: charge.sourceId,
        group: piece.group,
        method: piece.method,
        currency: piece.currency,
        amountMicros: piece.amountMicros,
        usdMicros: piece.usdMicros,
        vesRate: piece.vesRate,
        description: charge.description,
        customerName: charge.customerName,
        actor: charge.actor,
        createdAt: now,
      })),
    );
    return pieces;
  }

  /**
   * Anota la anulación de una venta (REQ-005-23): una fila negativa por cada fila de la venta,
   * con el mismo método, moneda y tasa, para devolver justo lo que se cobró. Devuelve la
   * descripción de la venta.
   */
  async reverseSale(
    tx: Transaction,
    saleId: string,
    shiftId: string,
    actor: Actor,
  ): Promise<string> {
    const rows = await tx
      .select()
      .from(cashEntries)
      .where(and(eq(cashEntries.source, 'sale'), eq(cashEntries.sourceId, saleId)));
    const [first] = rows;
    if (!first) {
      throw new Error(`La venta ${saleId} no tiene filas en el registro de caja`);
    }
    const now = this.clock.now();
    await tx.insert(cashEntries).values(
      rows.map((row) => ({
        id: newId(),
        shiftId,
        source: 'void' as const,
        sourceId: saleId,
        group: row.group,
        method: row.method,
        currency: row.currency,
        amountMicros: -row.amountMicros,
        usdMicros: -row.usdMicros,
        vesRate: row.vesRate,
        description: `Anulación · ${first.description}`,
        customerName: row.customerName,
        actor,
        createdAt: now,
      })),
    );
    return first.description;
  }

  /** Las filas de una caja, la más reciente primero. */
  async entries(shiftId: string, db: Database | Transaction = this.db): Promise<EntryRow[]> {
    return db
      .select()
      .from(cashEntries)
      .where(eq(cashEntries.shiftId, shiftId))
      .orderBy(desc(cashEntries.createdAt), desc(cashEntries.id));
  }

  /**
   * La lista de una caja (REQ-005-24): las filas de cada cobro juntas en un movimiento, el
   * más reciente arriba, con los totales por grupo (REQ-005-52).
   */
  async list(shiftId: string): Promise<CashList> {
    const rows = await this.entries(shiftId);
    // Las ventas anuladas de esta caja, con su motivo (REQ-005-23).
    const voided = new Map(
      (
        await this.db
          .select({ id: sales.id, reason: sales.voidReason })
          .from(sales)
          .where(and(eq(sales.shiftId, shiftId), isNotNull(sales.voidedAt)))
      ).map((sale) => [sale.id, sale.reason]),
    );
    // Las líneas de las ventas de esta caja, para el detalle de cada fila (REQ-005-24).
    const saleIds = [
      ...new Set(
        rows.flatMap((row) =>
          row.source === 'sale' || row.source === 'void' ? [row.sourceId] : [],
        ),
      ),
    ];
    const lineRows =
      saleIds.length === 0
        ? []
        : await this.db
            .select()
            .from(saleLines)
            .where(inArray(saleLines.saleId, saleIds))
            .orderBy(asc(saleLines.position));
    const linesBySale = new Map<string, CashMovementLine[]>();
    for (const line of lineRows) {
      const list = linesBySale.get(line.saleId) ?? [];
      list.push({
        kind: line.kind,
        name: line.kind === 'other' ? otherIncomeLabel(line.comment) : line.name,
        quantity: line.quantity,
        usdMicros: micros(line.totalMicros),
      });
      linesBySale.set(line.saleId, list);
    }
    const movements = new Map<string, { first: EntryRow; rows: EntryRow[] }>();
    for (const row of rows) {
      const key = `${row.source}:${row.sourceId}`;
      const movement = movements.get(key);
      if (movement) {
        movement.rows.push(row);
      } else {
        movements.set(key, { first: row, rows: [row] });
      }
    }
    return {
      shiftId,
      movements: [...movements.values()].map(({ first, rows: own }) =>
        toMovement(first, own, {
          voided: first.source === 'sale' && voided.has(first.sourceId),
          reason: first.source === 'void' ? (voided.get(first.sourceId) ?? null) : null,
          lines: linesBySale.get(first.sourceId) ?? [],
        }),
      ),
      totals: cashTotals(
        rows.map((row) => ({
          group: row.group,
          method: row.method,
          usdMicros: micros(row.usdMicros),
        })),
      ),
    };
  }
}

function toMovement(
  first: EntryRow,
  rows: readonly EntryRow[],
  state: { voided: boolean; reason: string | null; lines: CashMovementLine[] },
): CashMovement {
  const payments = paymentsOf(
    rows.map((row) => ({
      group: row.group,
      method: row.method,
      currency: row.currency,
      amountMicros: micros(row.amountMicros),
      usdMicros: micros(row.usdMicros),
      vesRate: row.vesRate === null ? null : vesRate(row.vesRate),
    })),
  );
  return {
    source: first.source,
    sourceId: first.sourceId,
    at: first.createdAt.toISOString(),
    description: first.description,
    customerName: first.customerName,
    usdMicros: micros(rows.reduce((sum, row) => sum + row.usdMicros, 0)),
    payments: payments.map((p) => ({
      method: p.method,
      currency: p.amount.currency,
      amountMicros: p.amount.micros,
      vesRate: p.vesRate,
    })),
    actorName: actorName(first.actor),
    ...state,
  };
}

/** El pago único de un cobro en caja de la spec 001, para su evento (nunca con saldo). */
export function deskPaymentOf(
  pieces: readonly CashPiece[],
): PaymentSummary & { method: PaymentMethod } {
  const payments = paymentsOf(pieces);
  const [payment] = payments;
  if (payments.length !== 1 || payment === undefined || payment.method === 'balance') {
    throw new Error('Un cobro en caja lleva un solo pago, y no con saldo');
  }
  return { ...payment, method: payment.method };
}
