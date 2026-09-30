import { sql } from 'drizzle-orm';
import { expect } from 'vitest';

import type { Database } from '../db/database.js';
import { customerBalances, ledger } from '../db/schema.js';

/**
 * Invariante del ledger (plan 001, ADR-0014): la caché `customer_balances` coincide con la
 * suma de los movimientos de cada cuenta y monedero.
 */
export async function assertBalancesMatchLedger(db: Database): Promise<void> {
  const sums = await db
    .select({
      customerId: ledger.customerId,
      wallet: ledger.wallet,
      total: sql<string>`sum(${ledger.amount})`,
    })
    .from(ledger)
    .groupBy(ledger.customerId, ledger.wallet);
  const fromLedger = new Map<string, { money: number; combo: number }>();
  for (const { customerId, wallet, total } of sums) {
    const entry = fromLedger.get(customerId) ?? { money: 0, combo: 0 };
    entry[wallet] = Number(total);
    fromLedger.set(customerId, entry);
  }

  const cached = new Map<string, { money: number; combo: number }>();
  for (const row of await db.select().from(customerBalances)) {
    // Una fila a cero sin movimientos equivale a no tener fila.
    if (row.moneyMicros !== 0 || row.comboSeconds !== 0 || fromLedger.has(row.customerId)) {
      cached.set(row.customerId, { money: row.moneyMicros, combo: row.comboSeconds });
    }
  }
  expect(cached).toEqual(fromLedger);
}
