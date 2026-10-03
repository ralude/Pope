import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type Actor,
  type CashShift,
  type ComboSnapshot,
  type Customer,
  type CustomerStatus,
  type CustomerBalances,
  type LedgerKind,
  micros,
  newId,
  type PaymentMethod,
  type RechargeRequest,
  type Wallet,
} from '@pope/shared';
import { and, eq, gte, sql } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { customerBalances, customers, ledger, sessions } from '../db/schema.js';
import { CashRegisterService, deskPaymentOf } from '../cash/cash-register.service.js';
import { requireCustomer } from '../customers/customers.service.js';
import { EventsService, type Transaction } from '../events/events.service.js';

/** Un movimiento de saldo (REQ-001-89). */
export interface LedgerEntry {
  /** Id de la fila; si no se da, uno nuevo. Lo da quien necesita enlazarla (registro de caja). */
  id?: string;
  customerId: string;
  wallet: Wallet;
  /** µUSD (monedero `money`) o segundos (monedero `combo`); negativo resta. */
  amount: number;
  kind: LedgerKind;
  actor: Actor;
  sessionId?: string;
  shiftId?: string;
  paymentMethod?: PaymentMethod;
  comboSnapshot?: ComboSnapshot;
  reason?: string;
  /** Venta del mostrador pagada con el saldo, o su anulación (spec 005). */
  saleId?: string;
}

/** El movimiento dejaría el saldo en negativo: el sistema es solo prepago. */
export class InsufficientBalanceError extends ConflictException {
  constructor() {
    super('Saldo insuficiente');
  }
}

/**
 * Motivo, para el personal, por el que una cuenta no activa no puede recibir recargas ni
 * combos (pregunta resuelta de la spec 001, REQ-001-04).
 */
export function inactiveAccountMessage(status: Exclude<CustomerStatus, 'active'>): string {
  const state = status === 'blocked' ? 'bloqueada' : 'desactivada';
  return `La cuenta está ${state}: actívala antes de cargarle saldo`;
}

const ZERO: CustomerBalances = { moneyMicros: micros(0), comboSeconds: 0 };

/** Columna de la caché que corresponde a cada monedero. */
const BALANCE_COLUMN = {
  money: customerBalances.moneyMicros,
  combo: customerBalances.comboSeconds,
} as const;

/**
 * Los dos saldos de cada cuenta (ADR-0014). El ledger es la verdad y `customer_balances`,
 * su caché: `post` escribe los dos en la misma transacción, así que nunca se separan.
 */
@Injectable()
export class WalletService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly cash: CashRegisterService,
    private readonly clock: Clock,
  ) {}

  /**
   * Recarga en caja (REQ-001-03): suma el importe al saldo en dinero, la anota en el registro
   * de caja (REQ-005-24; en Bs, con la tasa vigente) y emite `wallet.recharged`. El sistema no verifica el pago. Una cuenta
   * bloqueada o desactivada no puede recibir recargas (REQ-001-04).
   */
  async recharge(
    customerId: string,
    input: RechargeRequest,
    shift: CashShift,
    actor: Actor,
  ): Promise<Customer> {
    return this.events.inTransaction(async (tx, emit) => {
      // Bloquea la fila: un cambio de estado simultáneo espera a que termine la recarga.
      const [customer] = await tx
        .select()
        .from(customers)
        .where(eq(customers.id, customerId))
        .for('update');
      if (!customer) {
        throw new NotFoundException('No existe ese cliente');
      }
      if (customer.status !== 'active') {
        throw new ConflictException(inactiveAccountMessage(customer.status));
      }
      const ledgerId = newId();
      await this.post(tx, {
        id: ledgerId,
        customerId,
        wallet: 'money',
        amount: input.amountMicros,
        kind: 'recharge',
        actor,
        shiftId: shift.id,
        paymentMethod: input.paymentMethod,
      });
      const pieces = await this.cash.record(tx, {
        shiftId: shift.id,
        source: 'recharge',
        sourceId: ledgerId,
        description: `Recarga · ${customer.username}`,
        customerName: customer.username,
        groups: [{ group: 'pc', usdMicros: input.amountMicros }],
        payments: [{ method: input.paymentMethod, usdMicros: input.amountMicros }],
        actor,
      });
      emit({
        type: 'wallet.recharged',
        version: 2,
        actor,
        payload: {
          customer: { id: customer.id, username: customer.username },
          amount: { micros: input.amountMicros, currency: 'USD' },
          payment: deskPaymentOf(pieces),
          shiftId: shift.id,
        },
      });
      return requireCustomer(tx, customerId, this.clock.now());
    });
  }

  /**
   * Saldo en dinero que de verdad le queda a la cuenta: lo que la sesión en curso ya consumió
   * aún no está en el ledger (se liquida al cerrar), así que se descuenta aquí. Es lo que se
   * puede gastar ahora en una venta pagada con saldo (REQ-005-21).
   */
  async liveMoney(customerId: string, tx: Transaction): Promise<number> {
    const [active] = await tx
      .select({ charged: sessions.moneyChargedMicros })
      .from(sessions)
      .where(and(eq(sessions.customerId, customerId), eq(sessions.status, 'active')));
    const { moneyMicros } = await this.balances(customerId, tx);
    return moneyMicros - (active?.charged ?? 0);
  }

  /** Saldos de la cuenta; ceros si nunca tuvo movimientos. */
  async balances(
    customerId: string,
    db: Database | Transaction = this.db,
  ): Promise<CustomerBalances> {
    const [row] = await db
      .select()
      .from(customerBalances)
      .where(eq(customerBalances.customerId, customerId));
    return row ? toBalances(row) : ZERO;
  }

  /**
   * Registra un movimiento y actualiza la caché. Lanza `InsufficientBalanceError` si el
   * saldo quedaría en negativo; entonces quien llama debe deshacer la transacción (lo hace
   * `EventsService.inTransaction` al propagarse el error).
   */
  async post(tx: Transaction, entry: LedgerEntry): Promise<CustomerBalances> {
    if (!Number.isSafeInteger(entry.amount) || entry.amount === 0) {
      throw new RangeError(`Importe de movimiento no válido: ${String(entry.amount)}`);
    }
    if (entry.kind === 'adjustment' && !entry.reason?.trim()) {
      throw new RangeError('Un ajuste necesita un motivo');
    }

    await tx
      .insert(customerBalances)
      .values({ customerId: entry.customerId })
      .onConflictDoNothing();
    // La condición hace la comprobación y la suma en una sola sentencia: dos movimientos
    // simultáneos no pueden dejar el saldo en negativo.
    const column = BALANCE_COLUMN[entry.wallet];
    const [row] = await tx
      .update(customerBalances)
      .set(
        entry.wallet === 'money'
          ? { moneyMicros: sql`${column} + ${entry.amount}` }
          : { comboSeconds: sql`${column} + ${entry.amount}` },
      )
      .where(
        and(
          eq(customerBalances.customerId, entry.customerId),
          gte(sql`${column} + ${entry.amount}`, 0),
        ),
      )
      .returning();
    if (!row) {
      throw new InsufficientBalanceError();
    }

    await tx.insert(ledger).values({
      id: entry.id ?? newId(),
      customerId: entry.customerId,
      wallet: entry.wallet,
      amount: entry.amount,
      kind: entry.kind,
      sessionId: entry.sessionId,
      shiftId: entry.shiftId,
      paymentMethod: entry.paymentMethod,
      comboSnapshot: entry.comboSnapshot,
      reason: entry.reason,
      saleId: entry.saleId,
      actor: entry.actor,
      createdAt: this.clock.now(),
    });
    return toBalances(row);
  }
}

function toBalances(row: typeof customerBalances.$inferSelect): CustomerBalances {
  return {
    moneyMicros: micros(row.moneyMicros),
    comboSeconds: row.comboSeconds,
  };
}
