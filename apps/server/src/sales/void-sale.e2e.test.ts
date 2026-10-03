import {
  type CashMovement,
  type Customer,
  type Product,
  type ShiftEntriesResponse,
  usd,
} from '@pope/shared';
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cashEntries, events } from '../db/schema.js';
import { createTestApp, type TestApp } from '../testing/app.js';
import { loginAsStaff } from '../testing/auth.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { assertBalancesMatchLedger } from '../testing/wallet.js';
import { NO_OPENING_CASH, NOTHING_COUNTED } from '../testing/shifts.js';

describe('anular una venta (e2e, REQ-005-23)', () => {
  let testApp: TestApp;
  let admin: string;
  let ana: string;
  let refresco: Product;

  beforeEach(async () => {
    testApp = await createTestApp('local');
    admin = await loginAsStaff(testApp, 'admin', 'administrador', 'Luis');
    ana = await loginAsStaff(testApp, 'ana', 'encargado', 'Ana');
    refresco = (
      await request('POST', '/products', admin, {
        name: 'Refresco',
        priceMicros: usd(1),
        minStock: null,
        initialQuantity: 10,
      })
    ).json<Product>();
    await request('POST', '/shifts', ana, NO_OPENING_CASH);
  });

  afterEach(async () => {
    await testApp.close();
  });

  function request(method: 'GET' | 'POST', url: string, cookie: string, body?: object) {
    return testApp.app.inject({ method, url, headers: { cookie }, ...(body && { payload: body }) });
  }

  async function sellTwo(payments: object[], customerId: string | null = null) {
    const response = await request('POST', '/sales', ana, {
      lines: [{ kind: 'product', productId: refresco.id, quantity: 2 }],
      payments,
      customerId,
    });
    expect(response.statusCode).toBe(201);
    return response.json<CashMovement>();
  }

  const voidSale = (id: string, reason = 'error de cobro', cookie = admin) =>
    request('POST', `/sales/${id}/void`, cookie, { reason });

  const stock = async () => (await request('GET', '/products', ana)).json<Product[]>()[0]?.stock;

  const entries = async () =>
    (await request('GET', '/shifts/current/entries', ana)).json<ShiftEntriesResponse>();

  it('CA-005-11: anular 2 refrescos devuelve el stock, descuenta la caja y deja las dos filas', async () => {
    const sale = await sellTwo([{ method: 'cash_usd', usdMicros: usd(2) }]);
    expect(await stock()).toBe(8);

    const response = await voidSale(sale.sourceId);
    expect(response.statusCode).toBe(201);
    expect(response.json<CashMovement>()).toMatchObject({
      source: 'void',
      sourceId: sale.sourceId,
      description: 'Anulación · Refresco × 2',
      usdMicros: usd(-2),
      payments: [{ method: 'cash_usd', amountMicros: usd(-2) }],
      actorName: 'Luis',
      reason: 'error de cobro',
    });
    expect(await stock()).toBe(10);

    const list = await entries();
    expect(list.movements.map((m) => [m.source, m.voided, m.reason])).toEqual([
      ['void', false, 'error de cobro'],
      ['sale', true, null],
    ]);
    expect(list.totals.total).toBe(0);
    expect(
      (await testApp.database.db.select().from(events).orderBy(asc(events.seq))).at(-1),
    ).toMatchObject({
      type: 'sale.voided',
      actor: { kind: 'staff', name: 'Luis' },
      payload: { saleId: sale.sourceId, reason: 'error de cobro' },
    });
  });

  it('una venta en Bs se devuelve con la misma tasa, aunque haya cambiado', async () => {
    await request('POST', '/exchange-rate', ana, { vesPerUsd: 40_000_000 });
    const sale = await sellTwo([{ method: 'pos', usdMicros: usd(2) }]);
    await request('POST', '/exchange-rate', ana, { vesPerUsd: 45_000_000 });
    await voidSale(sale.sourceId);
    const rows = await testApp.database.db.select().from(cashEntries);
    expect(rows.map((r) => [r.source, r.amountMicros, r.vesRate]).sort()).toEqual(
      [
        ['sale', 80_000_000, 40_000_000],
        ['void', -80_000_000, 40_000_000],
      ].sort(),
    );
  });

  it('pagada con saldo, el saldo vuelve a la cuenta', async () => {
    const juan = await createCustomerWithBalance(testApp, 'juan', { moneyMicros: usd(5) });
    const sale = await sellTwo([{ method: 'balance', usdMicros: usd(2) }], juan.id);
    await voidSale(sale.sourceId);
    const customer = (await request('GET', `/customers/${juan.id}`, ana)).json<Customer>();
    expect(customer.balances.moneyMicros).toBe(usd(5));
    expect((await entries()).totals.balance).toBe(0);
    await assertBalancesMatchLedger(testApp.database.db);
  });

  it('no se anula dos veces, ni sin motivo, ni por la encargada', async () => {
    const sale = await sellTwo([{ method: 'cash_usd', usdMicros: usd(2) }]);
    expect((await voidSale(sale.sourceId, 'x', ana)).statusCode).toBe(403);
    expect((await voidSale(sale.sourceId, '  ')).statusCode).toBe(400);
    expect((await voidSale(sale.sourceId)).statusCode).toBe(201);
    const again = await voidSale(sale.sourceId);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ message: 'Esa venta ya está anulada' });
    expect(await stock()).toBe(10);
    expect((await voidSale('0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4aff')).statusCode).toBe(404);
  });

  it('una venta de una caja ya cerrada no se anula', async () => {
    const sale = await sellTwo([{ method: 'cash_usd', usdMicros: usd(2) }]);
    await request('POST', '/shifts/current/close', ana, NOTHING_COUNTED);
    await request('POST', '/shifts', ana, NO_OPENING_CASH);
    const response = await voidSale(sale.sourceId);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      message: 'Solo se anulan ventas de la caja abierta',
    });
    expect(await stock()).toBe(8);
  });
});
