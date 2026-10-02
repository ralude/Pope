import { newId, usd } from '@pope/shared';
import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CashRegisterService } from '../cash/cash-register.service.js';
import type { DatabaseHandle } from '../db/database.js';
import { customers, ledger } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';
import { FakeClock } from '../testing/clock.js';
import { createTestDatabase } from '../testing/database.js';
import { assertBalancesMatchLedger } from '../testing/wallet.js';
import { InsufficientBalanceError, type LedgerEntry, WalletService } from './wallet.service.js';

const SYSTEM = { kind: 'system' } as const;

describe('WalletService: ledger y dos saldos (REQ-001-83, REQ-001-89, ADR-0014)', () => {
  let handle: DatabaseHandle;
  let wallet: WalletService;
  let juan: string;
  let maria: string;

  beforeEach(async () => {
    handle = await createTestDatabase();
    // Estos tests solo usan `post`, que no toca el registro de caja.
    const cash = {} as CashRegisterService;
    wallet = new WalletService(handle.db, new EventsService(handle.db), cash, new FakeClock());
    juan = await insertCustomer('juan');
    maria = await insertCustomer('maria');
  });

  afterEach(async () => {
    await handle.close();
  });

  async function insertCustomer(username: string): Promise<string> {
    const id = newId();
    // El hash no importa aquí: estos tests no inician sesión.
    await handle.db.insert(customers).values({ id, username, passwordHash: 'x' });
    return id;
  }

  const post = (entry: Omit<LedgerEntry, 'actor'>) =>
    handle.db.transaction((tx) => wallet.post(tx, { ...entry, actor: SYSTEM }));

  it('una cuenta sin movimientos tiene los dos saldos a cero', async () => {
    expect(await wallet.balances(juan)).toEqual({ moneyMicros: 0, comboSeconds: 0 });
  });

  it('el dinero y las horas de combo son saldos independientes', async () => {
    await post({ customerId: juan, wallet: 'money', amount: usd(3), kind: 'recharge' });
    const after = await post({
      customerId: juan,
      wallet: 'combo',
      amount: 20 * 3600,
      kind: 'combo_purchase',
    });
    expect(after).toEqual({ moneyMicros: usd(3), comboSeconds: 72_000 });
    await post({ customerId: juan, wallet: 'combo', amount: -7200, kind: 'consumption' });
    expect(await wallet.balances(juan)).toEqual({ moneyMicros: usd(3), comboSeconds: 64_800 });
    expect(await wallet.balances(maria)).toEqual({ moneyMicros: 0, comboSeconds: 0 });
    await assertBalancesMatchLedger(handle.db);
  });

  it('cada movimiento queda en el ledger con su actor y sus datos', async () => {
    await post({ customerId: juan, wallet: 'money', amount: usd(2), kind: 'recharge' });
    await post({
      customerId: juan,
      wallet: 'money',
      amount: usd(-0.5),
      kind: 'adjustment',
      reason: 'Cobro duplicado',
    });
    const rows = await handle.db
      .select()
      .from(ledger)
      .where(eq(ledger.customerId, juan))
      .orderBy(asc(ledger.createdAt), asc(ledger.id));
    expect(rows.map((r) => [r.kind, r.amount, r.reason])).toEqual([
      ['recharge', usd(2), null],
      ['adjustment', usd(-0.5), 'Cobro duplicado'],
    ]);
    expect(rows[0]?.actor).toEqual(SYSTEM);
  });

  it('rechaza dejar un saldo en negativo y no escribe nada', async () => {
    await post({ customerId: juan, wallet: 'money', amount: usd(1), kind: 'recharge' });
    await expect(
      post({ customerId: juan, wallet: 'money', amount: usd(-1.01), kind: 'consumption' }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);
    await expect(
      post({ customerId: juan, wallet: 'combo', amount: -1, kind: 'consumption' }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);
    expect(await wallet.balances(juan)).toEqual({ moneyMicros: usd(1), comboSeconds: 0 });
    expect(await handle.db.select().from(ledger)).toHaveLength(1);
    await assertBalancesMatchLedger(handle.db);
  });

  it('se puede gastar el saldo exacto hasta dejarlo a cero', async () => {
    await post({ customerId: juan, wallet: 'money', amount: usd(1), kind: 'recharge' });
    await post({ customerId: juan, wallet: 'money', amount: usd(-1), kind: 'consumption' });
    expect(await wallet.balances(juan)).toEqual({ moneyMicros: 0, comboSeconds: 0 });
    await assertBalancesMatchLedger(handle.db);
  });

  it('si la transacción se deshace, no queda ni el movimiento ni el saldo', async () => {
    await expect(
      handle.db.transaction(async (tx) => {
        await wallet.post(tx, {
          customerId: juan,
          wallet: 'money',
          amount: usd(5),
          kind: 'recharge',
          actor: SYSTEM,
        });
        throw new Error('fallo posterior');
      }),
    ).rejects.toThrow('fallo posterior');
    expect(await wallet.balances(juan)).toEqual({ moneyMicros: 0, comboSeconds: 0 });
    await assertBalancesMatchLedger(handle.db);
  });

  it('rechaza importes a cero o no enteros, y ajustes sin motivo', async () => {
    for (const amount of [0, 1.5]) {
      await expect(
        post({ customerId: juan, wallet: 'money', amount, kind: 'recharge' }),
      ).rejects.toBeInstanceOf(RangeError);
    }
    await expect(
      post({ customerId: juan, wallet: 'money', amount: usd(1), kind: 'adjustment', reason: ' ' }),
    ).rejects.toBeInstanceOf(RangeError);
  });
});
