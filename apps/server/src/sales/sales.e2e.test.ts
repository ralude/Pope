import {
  type CashMovement,
  type Customer,
  type Product,
  type ShiftEntriesResponse,
  usd,
} from '@pope/shared';
import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NO_RATE_MESSAGE } from '../cash/cash-register.service.js';
import { cashEntries, events, ledger, saleLines } from '../db/schema.js';
import { createTestApp, type TestApp } from '../testing/app.js';
import { loginAsStaff } from '../testing/auth.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { assertBalancesMatchLedger } from '../testing/wallet.js';
import { NO_OPENING_CASH, NOTHING_COUNTED } from '../testing/shifts.js';

describe('ventas del mostrador (e2e, REQ-005-20 a REQ-005-22, REQ-005-25, REQ-005-43)', () => {
  let testApp: TestApp;
  let admin: string;
  let ana: string;
  let refresco: Product;
  let papas: Product;

  beforeEach(async () => {
    testApp = await createTestApp('local');
    admin = await loginAsStaff(testApp, 'admin', 'administrador', 'Luis');
    ana = await loginAsStaff(testApp, 'ana', 'encargado', 'Ana');
    refresco = await product('Refresco', usd(1), 10);
    papas = await product('Papas', usd(1.5), 10);
    await request('POST', '/shifts', ana, NO_OPENING_CASH);
  });

  afterEach(async () => {
    await testApp.close();
  });

  function request(method: 'GET' | 'POST' | 'PUT', url: string, cookie: string, body?: object) {
    return testApp.app.inject({ method, url, headers: { cookie }, ...(body && { payload: body }) });
  }

  async function product(name: string, priceMicros: number, initialQuantity: number) {
    const response = await request('POST', '/products', admin, {
      name,
      priceMicros,
      minStock: null,
      initialQuantity,
    });
    return response.json<Product>();
  }

  const sell = (body: object, cookie = ana) =>
    request('POST', '/sales', cookie, { customerId: null, ...body });

  const stockOf = async (id: string) =>
    (await request('GET', '/products', ana)).json<Product[]>().find((p) => p.id === id)?.stock;

  const lastEvent = async () =>
    (await testApp.database.db.select().from(events).orderBy(asc(events.seq))).at(-1);

  it('CA-005-02: un refresco a 1,00 USD pagado en efectivo Bs registra 40,00 Bs con la tasa 40', async () => {
    await request('POST', '/exchange-rate', ana, { vesPerUsd: 40_000_000 });
    const response = await sell({
      lines: [{ kind: 'product', productId: refresco.id, quantity: 1 }],
      payments: [{ method: 'cash_ves', usdMicros: usd(1) }],
    });
    expect(response.statusCode).toBe(201);
    expect(response.json<CashMovement>().payments).toEqual([
      { method: 'cash_ves', currency: 'VES', amountMicros: 40_000_000, vesRate: 40_000_000 },
    ]);
    expect(await stockOf(refresco.id)).toBe(9);
    expect(await lastEvent()).toMatchObject({
      type: 'sale.recorded',
      actor: { kind: 'staff', name: 'Ana' },
      payload: {
        customer: null,
        lines: [{ kind: 'product', name: 'Refresco', quantity: 1, total: { micros: usd(1) } }],
        payments: [
          {
            method: 'cash_ves',
            amount: { micros: 40_000_000, currency: 'VES' },
            usd: { micros: usd(1), currency: 'USD' },
            vesRate: 40_000_000,
          },
        ],
        total: { micros: usd(1), currency: 'USD' },
      },
    });
  });

  it('CA-005-07: un otro ingreso de 1,20 USD con "12 impresiones" en efectivo USD aparece en la lista', async () => {
    const response = await sell({
      lines: [{ kind: 'other', usdMicros: usd(1.2), comment: '12 impresiones' }],
      payments: [{ method: 'cash_usd', usdMicros: usd(1.2) }],
    });
    expect(response.statusCode).toBe(201);
    const { movements, totals } = (
      await request('GET', '/shifts/current/entries', ana)
    ).json<ShiftEntriesResponse>();
    const [movement] = movements;
    expect(movement).toMatchObject({
      source: 'sale',
      description: 'Otro ingreso · 12 impresiones',
      usdMicros: usd(1.2),
      payments: [{ method: 'cash_usd', currency: 'USD', amountMicros: usd(1.2) }],
      actorName: 'Ana',
    });
    expect(movement?.at).toMatch(/Z$/);
    // REQ-005-52: los otros ingresos van a otras ventas.
    expect(totals).toMatchObject({ other: usd(1.2), total: usd(1.2) });
    expect(await testApp.database.db.select().from(saleLines)).toEqual([
      expect.objectContaining({
        kind: 'other',
        name: 'Otro ingreso',
        quantity: 1,
        unitPriceMicros: usd(1.2),
        totalMicros: usd(1.2),
        comment: '12 impresiones',
        productId: null,
      }),
    ]);
    expect(await lastEvent()).toMatchObject({
      type: 'sale.recorded',
      version: 2,
      payload: {
        lines: [{ kind: 'other', comment: '12 impresiones', total: { micros: usd(1.2) } }],
      },
    });
  });

  it('REQ-005-05: ya no se venden conceptos', async () => {
    const response = await sell({
      lines: [{ kind: 'concept', conceptId: refresco.id, quantity: 12, unitPriceMicros: usd(0.1) }],
      payments: [{ method: 'cash_usd', usdMicros: usd(1.2) }],
    });
    expect(response.statusCode).toBe(400);
  });

  it('REQ-005-05: el comentario es opcional y tiene tope', async () => {
    const other = (comment: string | null) =>
      sell({
        lines: [{ kind: 'other', usdMicros: usd(0.5), comment }],
        payments: [{ method: 'cash_usd', usdMicros: usd(0.5) }],
      });
    const blank = await other('  ');
    expect(blank.statusCode).toBe(201);
    expect(blank.json<CashMovement>().description).toBe('Otro ingreso');
    expect(await lastEvent()).toMatchObject({ payload: { lines: [{ comment: null }] } });
    expect((await other('a'.repeat(81))).statusCode).toBe(400);
  });

  it('CA-005-10: juan paga unas papas con su saldo: le quedan 3,50 USD y no suma en la caja', async () => {
    const juan = await createCustomerWithBalance(testApp, 'juan', { moneyMicros: usd(5) });
    const response = await sell({
      lines: [{ kind: 'product', productId: papas.id, quantity: 1 }],
      payments: [{ method: 'balance', usdMicros: usd(1.5) }],
      customerId: juan.id,
    });
    expect(response.statusCode).toBe(201);
    expect(response.json<CashMovement>().payments).toEqual([
      { method: 'balance', currency: 'USD', amountMicros: usd(1.5), vesRate: null },
    ]);
    const customer = (await request('GET', `/customers/${juan.id}`, ana)).json<Customer>();
    expect(customer.balances.moneyMicros).toBe(usd(3.5));
    expect(await stockOf(papas.id)).toBe(9);
    const { totals } = (
      await request('GET', '/shifts/current/entries', ana)
    ).json<ShiftEntriesResponse>();
    expect(totals).toEqual({ pc: 0, snacks: 0, other: 0, total: 0, balance: usd(1.5) });
    const [row] = await testApp.database.db.select().from(ledger).where(eq(ledger.kind, 'sale'));
    expect(row).toMatchObject({ amount: -1_500_000, customerId: juan.id });
    expect(await lastEvent()).toMatchObject({
      payload: { customer: { id: juan.id, username: 'juan' } },
    });
    await assertBalancesMatchLedger(testApp.database.db);
  });

  it('una venta con golosinas y un otro ingreso y dos pagos se reparte por grupo', async () => {
    await request('POST', '/exchange-rate', ana, { vesPerUsd: 40_000_000 });
    const response = await sell({
      lines: [
        { kind: 'product', productId: papas.id, quantity: 2 },
        { kind: 'other', usdMicros: usd(1.5), comment: '10 impresiones' },
      ],
      payments: [
        { method: 'cash_usd', usdMicros: usd(2) },
        { method: 'pos', usdMicros: usd(2.5) },
      ],
    });
    expect(response.statusCode).toBe(201);
    expect(response.json<CashMovement>()).toMatchObject({
      description: 'Papas × 2, Otro ingreso · 10 impresiones',
      usdMicros: usd(4.5),
    });
    const rows = await testApp.database.db.select().from(cashEntries);
    expect(rows.map((r) => [r.group, r.method, r.usdMicros, r.amountMicros]).sort()).toEqual(
      [
        ['snacks', 'cash_usd', usd(2), usd(2)],
        ['snacks', 'pos', usd(1), 40_000_000],
        ['other', 'pos', usd(1.5), 60_000_000],
      ].sort(),
    );
    const { totals } = (
      await request('GET', '/shifts/current/entries', ana)
    ).json<ShiftEntriesResponse>();
    expect(totals).toMatchObject({ snacks: usd(3), other: usd(1.5), total: usd(4.5) });
  });

  it('REQ-005-12: sin stock no se vende, salvo que el administrador lo permita', async () => {
    const body = {
      lines: [
        { kind: 'product', productId: refresco.id, quantity: 6 },
        { kind: 'product', productId: refresco.id, quantity: 5 },
      ],
      payments: [{ method: 'cash_usd', usdMicros: usd(11) }],
    };
    const rejected = await sell(body);
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json()).toMatchObject({ message: 'No hay suficiente Refresco: quedan 10' });
    expect(await stockOf(refresco.id)).toBe(10);

    await request('PUT', '/settings', admin, { allowNegativeStock: 1 });
    expect((await sell(body)).statusCode).toBe(201);
    expect(await stockOf(refresco.id)).toBe(-1);
  });

  it('rechaza lo que no se puede cobrar, sin dejar nada a medias', async () => {
    const one = [{ kind: 'product', productId: refresco.id, quantity: 1 }];
    const noRate = await sell({
      lines: one,
      payments: [{ method: 'mobile_payment', usdMicros: usd(1) }],
    });
    expect(noRate.statusCode).toBe(409);
    expect(noRate.json()).toMatchObject({ message: NO_RATE_MESSAGE });

    const wrongTotal = await sell({
      lines: one,
      payments: [{ method: 'cash_usd', usdMicros: usd(2) }],
    });
    expect(wrongTotal.statusCode).toBe(400);
    expect(wrongTotal.json()).toMatchObject({ message: 'Los pagos no suman el total de la venta' });

    const pedro = await createCustomerWithBalance(testApp, 'pedro', { moneyMicros: usd(0.5) });
    const poor = await sell({
      lines: one,
      payments: [{ method: 'balance', usdMicros: usd(1) }],
      customerId: pedro.id,
    });
    expect(poor.statusCode).toBe(409);
    expect(poor.json()).toMatchObject({ message: 'Saldo insuficiente' });

    await testApp.app.inject({
      method: 'PATCH',
      url: `/products/${refresco.id}`,
      headers: { cookie: admin },
      payload: { active: false },
    });
    const inactive = await sell({
      lines: one,
      payments: [{ method: 'cash_usd', usdMicros: usd(1) }],
    });
    expect(inactive.statusCode).toBe(409);
    expect(inactive.json()).toMatchObject({ message: 'Refresco ya no está a la venta' });

    expect(await testApp.database.db.select().from(cashEntries)).toHaveLength(0);
    expect(await stockOf(refresco.id)).toBe(10);
  });

  it('REQ-005-43: sin caja abierta no se vende; el dueño nunca vende', async () => {
    const owner = await loginAsStaff(testApp, 'duena', 'dueno');
    const body = {
      lines: [{ kind: 'product', productId: refresco.id, quantity: 1 }],
      payments: [{ method: 'cash_usd', usdMicros: usd(1) }],
    };
    expect((await sell(body, owner)).statusCode).toBe(403);
    await request('POST', '/shifts/current/close', ana, NOTHING_COUNTED);
    const closed = await sell(body);
    expect(closed.statusCode).toBe(409);
    expect(closed.json()).toMatchObject({ message: 'Abre un turno de caja para continuar' });
  });
});
