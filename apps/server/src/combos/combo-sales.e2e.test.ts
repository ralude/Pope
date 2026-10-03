import { type CashShift, type Combo, type Customer, hours, usd } from '@pope/shared';
import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events, ledger } from '../db/schema.js';
import { createTestApp, type TestApp } from '../testing/app.js';
import { loginAsStaff } from '../testing/auth.js';
import { assertBalancesMatchLedger } from '../testing/wallet.js';
import { NO_OPENING_CASH, NOTHING_COUNTED } from '../testing/shifts.js';

describe('compra de combos desde el panel (e2e, REQ-001-82, REQ-001-84, REQ-001-85)', () => {
  let testApp: TestApp;
  let admin: string;
  let ana: string;
  let dueno: string;
  let juan: Customer;
  let combo20: Combo;

  beforeEach(async () => {
    testApp = await createTestApp('local');
    admin = await loginAsStaff(testApp, 'admin', 'administrador', 'Luis');
    ana = await loginAsStaff(testApp, 'ana', 'encargado', 'Ana');
    dueno = await loginAsStaff(testApp, 'dueno', 'dueno');
    juan = (
      await request('POST', '/customers', ana, { username: 'juan', password: '1234' })
    ).json<Customer>();
    combo20 = (
      await request('POST', '/combos', admin, {
        name: 'Combo 20 horas',
        priceMicros: usd(20),
        seconds: hours(20),
      })
    ).json<Combo>();
  });

  afterEach(async () => {
    await testApp.close();
  });

  function request(method: 'GET' | 'POST' | 'PATCH', url: string, cookie: string, body?: object) {
    return testApp.app.inject({ method, url, headers: { cookie }, ...(body && { payload: body }) });
  }

  const openShift = async () =>
    (await request('POST', '/shifts', ana, NO_OPENING_CASH)).json<CashShift>();

  async function rechargeJuan(amount: number) {
    await openShift();
    await request('POST', `/customers/${juan.id}/recharges`, ana, {
      amountMicros: amount,
      paymentMethod: 'cash_usd',
    });
  }

  const buy = (payment: object, cookie = ana, comboId = combo20.id) =>
    request('POST', `/customers/${juan.id}/combo-purchases`, cookie, { comboId, payment });

  const lastEvent = async () =>
    (await testApp.database.db.select().from(events).orderBy(asc(events.seq))).at(-1);

  it('CA-001-17: con 25 USD de saldo, compra el combo de 20 h y le quedan 5 USD y 20:00:00', async () => {
    await rechargeJuan(usd(25));
    const response = await buy({ via: 'balance' });
    expect(response.statusCode).toBe(201);
    expect(response.json<Customer>().balances).toEqual({
      moneyMicros: usd(5),
      comboSeconds: hours(20),
    });
    expect(await lastEvent()).toMatchObject({
      type: 'combo.purchased',
      actor: { kind: 'staff', name: 'Ana' },
      payload: {
        customer: { id: juan.id, username: 'juan' },
        combo: {
          id: combo20.id,
          name: 'Combo 20 horas',
          price: { micros: usd(20) },
          seconds: hours(20),
        },
        payment: { via: 'balance' },
        sessionId: null,
      },
    });
    await assertBalancesMatchLedger(testApp.database.db);
  });

  it('en caja suma las horas sin tocar el saldo y liga el cobro al turno', async () => {
    const shift = await openShift();
    // El punto de venta es en Bs: hace falta la tasa del día (spec 005).
    await request('POST', '/exchange-rate', ana, { vesPerUsd: 40_000_000 });
    const response = await buy({ via: 'cash_desk', paymentMethod: 'pos' });
    expect(response.json<Customer>().balances).toEqual({ moneyMicros: 0, comboSeconds: hours(20) });
    const rows = await testApp.database.db
      .select()
      .from(ledger)
      .where(eq(ledger.customerId, juan.id));
    expect(rows).toEqual([
      expect.objectContaining({
        wallet: 'combo',
        amount: hours(20),
        kind: 'combo_purchase',
        shiftId: shift.id,
        paymentMethod: 'pos',
        comboSnapshot: {
          id: combo20.id,
          name: 'Combo 20 horas',
          priceMicros: usd(20),
          seconds: hours(20),
        },
      }),
    ]);
    expect(await lastEvent()).toMatchObject({
      version: 2,
      payload: {
        payment: {
          via: 'cash_desk',
          payment: { method: 'pos', amount: { micros: 800_000_000, currency: 'VES' } },
          shiftId: shift.id,
        },
      },
    });
    await assertBalancesMatchLedger(testApp.database.db);
  });

  it('en caja sin turno abierto se rechaza; con saldo no hace falta turno', async () => {
    const response = await buy({ via: 'cash_desk', paymentMethod: 'cash_usd' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ message: 'Abre un turno de caja para continuar' });
    await rechargeJuan(usd(20));
    await request('POST', '/shifts/current/close', ana, NOTHING_COUNTED);
    expect((await buy({ via: 'balance' })).statusCode).toBe(201);
  });

  it('con saldo insuficiente se rechaza y no cambia nada', async () => {
    await rechargeJuan(usd(19.99));
    const response = await buy({ via: 'balance' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ message: 'Saldo insuficiente' });
    const current = (await request('GET', `/customers/${juan.id}`, ana)).json<Customer>();
    expect(current.balances).toEqual({ moneyMicros: usd(19.99), comboSeconds: 0 });
    await assertBalancesMatchLedger(testApp.database.db);
  });

  it('editar el combo después no cambia las horas vendidas (REQ-001-81)', async () => {
    await openShift();
    await buy({ via: 'cash_desk', paymentMethod: 'cash_usd' });
    await request('PATCH', `/combos/${combo20.id}`, admin, { seconds: hours(10) });
    const current = (await request('GET', `/customers/${juan.id}`, ana)).json<Customer>();
    expect(current.balances.comboSeconds).toBe(hours(20));
  });

  it('no se vende un combo desactivado ni a una cuenta bloqueada', async () => {
    await openShift();
    await request('PATCH', `/combos/${combo20.id}`, admin, { active: false });
    const inactiveCombo = await buy({ via: 'cash_desk', paymentMethod: 'cash_usd' });
    expect(inactiveCombo.statusCode).toBe(409);
    expect(inactiveCombo.json()).toMatchObject({ message: 'Ese combo ya no está a la venta' });

    await request('PATCH', `/combos/${combo20.id}`, admin, { active: true });
    await request('PATCH', `/customers/${juan.id}/status`, ana, { status: 'blocked' });
    const blocked = await buy({ via: 'cash_desk', paymentMethod: 'cash_usd' });
    expect(blocked.statusCode).toBe(409);
    expect(await testApp.database.db.select().from(ledger)).toHaveLength(0);
  });

  it('el dueño no vende combos y un combo inexistente da 404', async () => {
    expect((await buy({ via: 'balance' }, dueno)).statusCode).toBe(403);
    const missing = await buy({ via: 'balance' }, ana, '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a99');
    expect(missing.statusCode).toBe(404);
  });
});
