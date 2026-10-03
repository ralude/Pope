import {
  type CashShift,
  type Customer,
  type ShiftClosing,
  type ShiftSummary,
  usd,
} from '@pope/shared';
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events } from '../db/schema.js';
import { createTestApp, type TestApp } from '../testing/app.js';
import { loginAsStaff } from '../testing/auth.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { NO_OPENING_CASH, NOTHING_COUNTED } from '../testing/shifts.js';

const bs = (amount: number) => usd(amount); // mismas µ-unidades, en VES

describe('caja con fondo y cierre con conteo (e2e, REQ-005-40, REQ-005-42, REQ-005-53)', () => {
  let testApp: TestApp;
  let ana: string;
  let luis: string;
  let dueno: string;
  let juan: Customer;

  beforeEach(async () => {
    testApp = await createTestApp('local');
    ana = await loginAsStaff(testApp, 'ana', 'encargado', 'Ana');
    luis = await loginAsStaff(testApp, 'luis', 'administrador', 'Luis');
    dueno = await loginAsStaff(testApp, 'dueno', 'dueno', 'Dueño');
    juan = await createCustomerWithBalance(testApp, 'juan');
  });

  afterEach(async () => {
    await testApp.close();
  });

  function request(method: 'GET' | 'POST', url: string, cookie: string, body?: object) {
    return testApp.app.inject({ method, url, headers: { cookie }, ...(body && { payload: body }) });
  }

  const open = (cashUsd: number, cashVes: number, cookie = ana) =>
    request('POST', '/shifts', cookie, { cashUsdMicros: cashUsd, cashVesMicros: cashVes });

  const recharge = (amountMicros: number, paymentMethod: string) =>
    request('POST', `/customers/${juan.id}/recharges`, ana, { amountMicros, paymentMethod });

  const counted = (cashUsd: number, cashVes: number, mobile = 0, pos = 0) => ({
    counted: { cash_usd: cashUsd, cash_ves: cashVes, mobile_payment: mobile, pos },
  });

  const lastEvent = async () =>
    (await testApp.database.db.select().from(events).orderBy(asc(events.seq))).at(-1);

  it('REQ-005-40: se abre con el fondo en efectivo USD y Bs, que queda en el evento', async () => {
    const response = await open(usd(20), bs(500));
    expect(response.statusCode).toBe(201);
    expect(await lastEvent()).toMatchObject({
      type: 'shift.opened',
      version: 2,
      actor: { kind: 'staff', name: 'Ana' },
      payload: {
        shiftId: response.json<CashShift>().id,
        openingCash: {
          usd: { micros: usd(20), currency: 'USD' },
          ves: { micros: bs(500), currency: 'VES' },
        },
      },
    });
  });

  it('sin fondo, o con fondo negativo, no se abre', async () => {
    expect((await request('POST', '/shifts', ana)).statusCode).toBe(400);
    expect((await open(usd(-1), 0)).statusCode).toBe(400);
  });

  it('CA-005-03: con 50 USD esperados en efectivo y 45 contados, la diferencia es −5 USD', async () => {
    await open(usd(20), bs(500));
    await recharge(usd(30), 'cash_usd');
    const closing = (await request('GET', '/shifts/current/closing', ana)).json<ShiftClosing>();
    expect(closing).toMatchObject({
      opening: { cashUsdMicros: usd(20), cashVesMicros: bs(500) },
      expected: { cash_usd: usd(50), cash_ves: bs(500), mobile_payment: 0, pos: 0 },
      totals: { pc: usd(30), total: usd(30) },
    });

    const response = await request('POST', '/shifts/current/close', ana, counted(usd(45), bs(500)));
    expect(response.statusCode).toBe(200);
    expect(response.json<ShiftSummary>()).toMatchObject({
      staffName: 'Ana',
      expected: { cash_usd: usd(50) },
      counted: { cash_usd: usd(45) },
      difference: { cash_usd: usd(-5), cash_ves: 0, mobile_payment: 0, pos: 0 },
    });
    expect(await lastEvent()).toMatchObject({
      type: 'shift.closed',
      version: 2,
      payload: {
        methods: {
          cash_usd: {
            currency: 'USD',
            expected: usd(50),
            counted: usd(45),
            difference: usd(-5),
          },
          cash_ves: { currency: 'VES', expected: bs(500), counted: bs(500), difference: 0 },
        },
      },
    });
  });

  it('lo cobrado en Bs se espera en Bs, en su método', async () => {
    await open(0, bs(500));
    await request('POST', '/exchange-rate', ana, { vesPerUsd: 40_000_000 });
    await recharge(usd(2), 'pos');
    await recharge(usd(1), 'cash_ves');
    const { expected } = (
      await request('GET', '/shifts/current/closing', ana)
    ).json<ShiftClosing>();
    expect(expected).toEqual({ cash_usd: 0, cash_ves: bs(540), mobile_payment: 0, pos: bs(80) });
  });

  it('cerrar pide lo contado en los cuatro métodos', async () => {
    await open(0, 0);
    expect((await request('POST', '/shifts/current/close', ana)).statusCode).toBe(400);
    const missing = { counted: { cash_usd: 0, cash_ves: 0, mobile_payment: 0 } };
    expect((await request('POST', '/shifts/current/close', ana, missing)).statusCode).toBe(400);
  });

  it('sin caja abierta no hay nada que cerrar', async () => {
    const response = await request('GET', '/shifts/current/closing', ana);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ message: 'No hay una caja abierta' });
  });

  it('REQ-005-53: el historial, para el administrador y el dueño, la más reciente arriba', async () => {
    await open(usd(20), 0);
    await recharge(usd(5), 'cash_usd');
    await request('POST', '/shifts/current/close', ana, counted(usd(25), 0));
    await open(0, 0, luis);

    const response = await request('GET', '/shifts', dueno);
    expect(response.statusCode).toBe(200);
    const history = response.json<ShiftSummary[]>();
    expect(history.map((s) => [s.staffName, s.closedAt === null])).toEqual([
      ['Luis', true],
      ['Ana', false],
    ]);
    expect(history[0]).toMatchObject({ expected: null, counted: null, difference: null });
    expect(history[1]).toMatchObject({
      totals: { pc: usd(5), total: usd(5) },
      difference: { cash_usd: 0 },
    });
    expect((await request('GET', '/shifts', luis)).statusCode).toBe(200);
    expect((await request('GET', '/shifts', ana)).statusCode).toBe(403);
  });

  it('los cuerpos de los tests valen: fondo 0 y nada contado', async () => {
    expect((await request('POST', '/shifts', ana, NO_OPENING_CASH)).statusCode).toBe(201);
    expect((await request('POST', '/shifts/current/close', ana, NOTHING_COUNTED)).statusCode).toBe(
      200,
    );
  });
});
