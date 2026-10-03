import { newId, type Product, type StockMovement, usd } from '@pope/shared';
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events } from '../db/schema.js';
import { createTestApp, type TestApp } from '../testing/app.js';
import { loginAsStaff } from '../testing/auth.js';
import { NO_OPENING_CASH } from '../testing/shifts.js';

describe('movimientos de stock (e2e, REQ-005-10 a REQ-005-14)', () => {
  let testApp: TestApp;
  let admin: string;
  let ana: string;
  let dueno: string;
  let refresco: Product;

  beforeEach(async () => {
    testApp = await createTestApp('local');
    admin = await loginAsStaff(testApp, 'admin', 'administrador', 'Luis');
    ana = await loginAsStaff(testApp, 'ana', 'encargado', 'Ana');
    dueno = await loginAsStaff(testApp, 'dueno', 'dueno', 'Dueño');
    refresco = (
      await request('POST', '/products', admin, {
        name: 'Refresco',
        priceMicros: usd(1),
        minStock: 5,
        initialQuantity: 10,
      })
    ).json<Product>();
  });

  afterEach(async () => {
    await testApp.close();
  });

  function request(method: 'GET' | 'POST' | 'PUT', url: string, cookie: string, body?: object) {
    return testApp.app.inject({ method, url, headers: { cookie }, ...(body && { payload: body }) });
  }

  const move = (body: object, cookie = admin) =>
    request('POST', `/products/${refresco.id}/stock`, cookie, body);

  const movements = async () =>
    (await request('GET', `/products/${refresco.id}/movements`, dueno)).json<StockMovement[]>();

  it('CA-005-01: con 10, 3 vendidos y 1 de merma quedan 6, con actor y hora', async () => {
    await request('POST', '/shifts', ana, NO_OPENING_CASH);
    const sale = await request('POST', '/sales', ana, {
      lines: [{ kind: 'product', productId: refresco.id, quantity: 3 }],
      payments: [{ method: 'cash_usd', usdMicros: usd(3) }],
      customerId: null,
    });
    expect(sale.statusCode).toBe(201);
    const response = await move({ kind: 'waste', quantity: 1, reason: 'Se rompió' });
    expect(response.statusCode).toBe(201);
    expect(response.json<Product>()).toMatchObject({ stock: 6, lowStock: false });

    const listed = await movements();
    expect(listed.map((m) => [m.kind, m.quantity, m.actorName])).toEqual([
      ['waste', -1, 'Luis'],
      ['sale', -3, 'Ana'],
      ['restock', 10, 'Luis'],
    ]);
    expect(listed[0]?.reason).toBe('Se rompió');
    expect(listed[0]?.createdAt).toMatch(/Z$/);
    expect(
      (await testApp.database.db.select().from(events).orderBy(asc(events.seq))).at(-1),
    ).toMatchObject({
      type: 'stock.moved',
      actor: { kind: 'staff', name: 'Luis' },
      payload: { kind: 'waste', product: { id: refresco.id }, quantity: -1, reason: 'Se rompió' },
    });
  });

  it('REQ-005-14: la encargada registra entradas, pero no ajustes ni mermas', async () => {
    const restock = await move({ kind: 'restock', quantity: 24 }, ana);
    expect(restock.statusCode).toBe(201);
    expect(restock.json<Product>().stock).toBe(34);
    expect((await move({ kind: 'waste', quantity: 1, reason: 'Roto' }, ana)).statusCode).toBe(403);
    expect(
      (await move({ kind: 'adjustment', quantity: -1, reason: 'Conteo' }, ana)).statusCode,
    ).toBe(403);
    expect((await move({ kind: 'restock', quantity: 1 }, dueno)).statusCode).toBe(403);
  });

  it('REQ-005-13: bajo el mínimo, la lista lo avisa', async () => {
    await move({ kind: 'adjustment', quantity: -6, reason: 'Conteo' });
    const [listed] = (await request('GET', '/products', ana)).json<Product[]>();
    expect(listed).toMatchObject({ stock: 4, lowStock: true });
  });

  it('REQ-005-12: no deja el stock en negativo salvo que el administrador lo permita', async () => {
    const tooMuch = await move({ kind: 'waste', quantity: 11, reason: 'Vencido' });
    expect(tooMuch.statusCode).toBe(409);
    expect(tooMuch.json()).toMatchObject({ message: 'No hay tanto stock de Refresco' });

    await request('PUT', '/settings', admin, { allowNegativeStock: 1 });
    const allowed = await move({ kind: 'waste', quantity: 11, reason: 'Vencido' });
    expect(allowed.statusCode).toBe(201);
    expect(allowed.json<Product>().stock).toBe(-1);
  });

  it('ajustes y mermas sin motivo se rechazan, y un producto que no existe da 404', async () => {
    expect((await move({ kind: 'waste', quantity: 1 })).statusCode).toBe(400);
    const missing = newId();
    expect(
      (await request('POST', `/products/${missing}/stock`, admin, { kind: 'restock', quantity: 1 }))
        .statusCode,
    ).toBe(404);
    expect((await request('GET', `/products/${missing}/movements`, admin)).statusCode).toBe(404);
  });
});
