import { type CashShift, type Customer, type CustomerPage, usd } from '@pope/shared';
import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events, ledger } from '../db/schema.js';
import { createTestApp, type TestApp } from '../testing/app.js';
import { loginAsStaff } from '../testing/auth.js';
import { assertBalancesMatchLedger } from '../testing/wallet.js';

describe('recargas desde el panel (e2e, REQ-001-03)', () => {
  let testApp: TestApp;
  let ana: string;
  let dueno: string;
  let juan: Customer;

  beforeEach(async () => {
    testApp = await createTestApp('local');
    ana = await loginAsStaff(testApp, 'ana', 'encargado', 'Ana');
    dueno = await loginAsStaff(testApp, 'dueno', 'dueno');
    juan = (
      await request('POST', '/customers', ana, { username: 'juan', password: '1234' })
    ).json<Customer>();
  });

  afterEach(async () => {
    await testApp.close();
  });

  function request(method: 'GET' | 'POST' | 'PATCH', url: string, cookie: string, body?: object) {
    return testApp.app.inject({ method, url, headers: { cookie }, ...(body && { payload: body }) });
  }

  const openShift = async (cookie: string) =>
    (await request('POST', '/shifts', cookie)).json<CashShift>();

  const recharge = (body: object, cookie = ana, customerId = juan.id) =>
    request('POST', `/customers/${customerId}/recharges`, cookie, body);

  it('un cliente nuevo tiene los dos saldos a cero', () => {
    expect(juan.balances).toEqual({ moneyMicros: 0, comboSeconds: 0 });
  });

  it('la encargada recarga en su turno: sube el saldo, queda en el ledger y emite el evento', async () => {
    const shift = await openShift(ana);
    // El pago móvil es en Bs: hace falta la tasa del día (spec 005).
    await request('POST', '/exchange-rate', ana, { vesPerUsd: 40_000_000 });
    const response = await recharge({ amountMicros: usd(3), paymentMethod: 'mobile_payment' });
    expect(response.statusCode).toBe(201);
    expect(response.json<Customer>().balances).toEqual({ moneyMicros: usd(3), comboSeconds: 0 });

    const [row] = await testApp.database.db
      .select()
      .from(ledger)
      .where(eq(ledger.customerId, juan.id));
    expect(row).toMatchObject({
      wallet: 'money',
      amount: usd(3),
      kind: 'recharge',
      shiftId: shift.id,
      paymentMethod: 'mobile_payment',
      actor: { kind: 'staff', name: 'Ana' },
    });
    const all = await testApp.database.db.select().from(events).orderBy(asc(events.seq));
    expect(all.at(-1)).toMatchObject({
      type: 'wallet.recharged',
      actor: { kind: 'staff', name: 'Ana' },
      payload: {
        customer: { id: juan.id, username: 'juan' },
        amount: { micros: usd(3), currency: 'USD' },
        payment: {
          method: 'mobile_payment',
          amount: { micros: 120_000_000, currency: 'VES' },
          vesRate: 40_000_000,
        },
        shiftId: shift.id,
      },
    });
    await assertBalancesMatchLedger(testApp.database.db);
  });

  it('las recargas se acumulan y el panel ve el saldo en la lista y en la ficha', async () => {
    await openShift(ana);
    await request('POST', '/exchange-rate', ana, { vesPerUsd: 40_000_000 });
    await recharge({ amountMicros: usd(3), paymentMethod: 'cash_usd' });
    await recharge({ amountMicros: usd(0.25), paymentMethod: 'pos' });
    const expected = { moneyMicros: usd(3.25), comboSeconds: 0 };
    expect(
      (await request('GET', `/customers/${juan.id}`, dueno)).json<Customer>().balances,
    ).toEqual(expected);
    const page = (await request('GET', '/customers', dueno)).json<CustomerPage>();
    expect(page.items[0]?.balances).toEqual(expected);
    await assertBalancesMatchLedger(testApp.database.db);
  });

  it('sin turno abierto se rechaza con 409 y no cambia nada', async () => {
    const response = await recharge({ amountMicros: usd(3), paymentMethod: 'cash_usd' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ message: 'Abre un turno de caja para continuar' });
    expect(await testApp.database.db.select().from(ledger)).toHaveLength(0);
  });

  it('una cuenta bloqueada o desactivada no recibe recargas', async () => {
    await openShift(ana);
    for (const [status, word] of [
      ['blocked', 'bloqueada'],
      ['disabled', 'desactivada'],
    ] as const) {
      await request('PATCH', `/customers/${juan.id}/status`, ana, { status });
      const response = await recharge({ amountMicros: usd(1), paymentMethod: 'cash_usd' });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        message: `La cuenta está ${word}: actívala antes de cargarle saldo`,
      });
    }
    expect(await testApp.database.db.select().from(ledger)).toHaveLength(0);
  });

  it('rechaza importes no válidos con 400 y un cliente inexistente con 404', async () => {
    await openShift(ana);
    for (const body of [
      { amountMicros: 0, paymentMethod: 'cash_usd' },
      { amountMicros: usd(-1), paymentMethod: 'cash_usd' },
      { amountMicros: 1.5, paymentMethod: 'cash_usd' },
      { amountMicros: usd(1), paymentMethod: 'bitcoin' },
    ]) {
      expect((await recharge(body)).statusCode).toBe(400);
    }
    const missing = await recharge(
      { amountMicros: usd(1), paymentMethod: 'cash_usd' },
      ana,
      '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a99',
    );
    expect(missing.statusCode).toBe(404);
  });

  it('el dueño no puede recargar', async () => {
    const response = await recharge({ amountMicros: usd(1), paymentMethod: 'cash_usd' }, dueno);
    expect(response.statusCode).toBe(403);
  });
});
