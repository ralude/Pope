import { type Product, usd } from '@pope/shared';
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events } from '../db/schema.js';
import { createTestApp, type TestApp } from '../testing/app.js';
import { loginAsStaff } from '../testing/auth.js';

describe('productos (e2e, REQ-005-01 a REQ-005-05)', () => {
  let testApp: TestApp;
  let admin: string;
  let ana: string;
  let dueno: string;

  beforeEach(async () => {
    testApp = await createTestApp('local');
    admin = await loginAsStaff(testApp, 'admin', 'administrador', 'Luis');
    ana = await loginAsStaff(testApp, 'ana', 'encargado', 'Ana');
    dueno = await loginAsStaff(testApp, 'dueno', 'dueno', 'Dueño');
  });

  afterEach(async () => {
    await testApp.close();
  });

  function request(method: 'GET' | 'POST' | 'PATCH', url: string, cookie: string, body?: object) {
    return testApp.app.inject({ method, url, headers: { cookie }, ...(body && { payload: body }) });
  }

  const allEvents = () => testApp.database.db.select().from(events).orderBy(asc(events.seq));

  const DORITOS = { name: 'Doritos', priceMicros: usd(1.5), minStock: 5, initialQuantity: 24 };

  async function createProduct(body: object = DORITOS): Promise<Product> {
    const response = await request('POST', '/products', admin, body);
    expect(response.statusCode).toBe(201);
    return response.json<Product>();
  }

  describe('productos', () => {
    it('se puede dar de alta ya desactivado, y queda así en el evento', async () => {
      const product = await createProduct({ ...DORITOS, active: false });
      expect(product.active).toBe(false);
      const created = (await allEvents()).find((event) => event.type === 'product.created');
      expect(created?.payload).toMatchObject({ product: { active: false } });
    });

    it('CA-005-08 (sin la foto): Doritos a 1,50 USD con una entrada de 24', async () => {
      const product = await createProduct();
      expect(product).toMatchObject({
        name: 'Doritos',
        priceMicros: usd(1.5),
        minStock: 5,
        active: true,
        photoVersion: null,
        stock: 24,
        lowStock: false,
      });
      const [created, moved] = (await allEvents()).slice(-2);
      expect(created).toMatchObject({
        type: 'product.created',
        actor: { kind: 'staff', name: 'Luis' },
        payload: {
          productId: product.id,
          product: { name: 'Doritos', price: { micros: usd(1.5), currency: 'USD' }, minStock: 5 },
        },
      });
      // La cantidad que llegó es una entrada, nunca un stock escrito (REQ-005-10).
      expect(moved).toMatchObject({
        type: 'stock.moved',
        payload: { kind: 'restock', product: { id: product.id }, quantity: 24, reason: null },
      });
      const listed = (await request('GET', '/products', ana)).json<Product[]>();
      expect(listed).toEqual([product]);
    });

    it('sin cantidad inicial no hay entrada y el stock es 0, bajo su mínimo', async () => {
      const product = await createProduct({ ...DORITOS, initialQuantity: 0 });
      expect(product).toMatchObject({ stock: 0, lowStock: true });
      expect((await allEvents()).at(-1)?.type).toBe('product.created');
    });

    it('REQ-005-02: el cambio de precio queda con el anterior, el nuevo y quién lo hizo', async () => {
      const product = await createProduct();
      const response = await request('PATCH', `/products/${product.id}`, admin, {
        priceMicros: usd(1.75),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json<Product>()).toMatchObject({ priceMicros: usd(1.75), stock: 24 });
      expect((await allEvents()).at(-1)).toMatchObject({
        type: 'product.updated',
        actor: { kind: 'staff', name: 'Luis' },
        payload: {
          productId: product.id,
          before: { price: { micros: usd(1.5) } },
          after: { price: { micros: usd(1.75) } },
        },
      });
    });

    it('editar sin cambios no emite evento', async () => {
      const product = await createProduct();
      const before = (await allEvents()).length;
      await request('PATCH', `/products/${product.id}`, admin, { name: 'Doritos' });
      expect(await allEvents()).toHaveLength(before);
    });

    it('los desactivados van al final de la lista', async () => {
      const doritos = await createProduct();
      await createProduct({ ...DORITOS, name: 'Agua' });
      await request('PATCH', `/products/${doritos.id}`, admin, { active: false });
      await createProduct({ ...DORITOS, name: 'Refresco' });
      const names = (await request('GET', '/products', ana)).json<Product[]>().map((p) => p.name);
      expect(names).toEqual(['Agua', 'Refresco', 'Doritos']);
    });

    it('REQ-005-04: el encargado y el dueño los ven pero no los crean ni editan', async () => {
      const product = await createProduct();
      expect((await request('GET', '/products', dueno)).statusCode).toBe(200);
      expect((await request('POST', '/products', ana, DORITOS)).statusCode).toBe(403);
      expect((await request('POST', '/products', dueno, DORITOS)).statusCode).toBe(403);
      expect(
        (await request('PATCH', `/products/${product.id}`, ana, { active: false })).statusCode,
      ).toBe(403);
    });

    it('valida los datos y responde 404 si no existe', async () => {
      expect(
        (await request('POST', '/products', admin, { ...DORITOS, priceMicros: 0 })).statusCode,
      ).toBe(400);
      const missing = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4aff';
      expect(
        (await request('PATCH', `/products/${missing}`, admin, { active: false })).statusCode,
      ).toBe(404);
    });
  });

  it('REQ-005-05: los conceptos ya no existen: el otro ingreso los sustituyó', async () => {
    const body = { name: 'Impresiones', unitPriceMicros: usd(0.1) };
    expect((await request('POST', '/sale-concepts', admin, body)).statusCode).toBe(404);
    expect((await request('GET', '/sale-concepts', admin)).statusCode).toBe(404);
  });
});
