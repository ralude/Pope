import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  type ComboSnapshot,
  type CustomerBalances,
  type LedgerKind,
  micros,
  newId,
  type PaymentMethod,
  type Wallet,
} from '@pope/shared';
import { and, eq, gte, sql } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { customerBalances, ledger } from '../db/schema.js';
import type { Transaction } from '../events/events.service.js';

/** Un movimiento de saldo (REQ-001-89). */
export interface LedgerEntry {
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
}

/** El movimiento dejaría el saldo en negativo: el sistema es solo prepago. */
export class InsufficientBalanceError extends ConflictException {
  constructor() {
    super('Saldo insuficiente');
  }
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
    private readonly clock: Clock,
  ) {}

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
      id: newId(),
      customerId: entry.customerId,
      wallet: entry.wallet,
      amount: entry.amount,
      kind: entry.kind,
      sessionId: entry.sessionId,
      shiftId: entry.shiftId,
      paymentMethod: entry.paymentMethod,
      comboSnapshot: entry.comboSnapshot,
      reason: entry.reason,
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
