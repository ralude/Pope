import type { Customer, CustomerPage } from '@pope/shared';
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events } from '../db/schema.js';
import { createTestApp, type TestApp } from '../testing/app.js';
import { loginAsStaff } from '../testing/auth.js';

describe('cuentas de cliente (e2e, REQ-001-01, REQ-001-02, REQ-001-04)', () => {
  let testApp: TestApp;
  let ana: string;
  let dueno: string;

  beforeEach(async () => {
    testApp = await createTestApp('local');
    ana = await loginAsStaff(testApp, 'ana', 'encargado', 'Ana');
    dueno = await loginAsStaff(testApp, 'dueno', 'dueno');
  });

  afterEach(async () => {
    await testApp.close();
  });

  function request(method: 'GET' | 'POST' | 'PATCH', url: string, cookie: string, body?: object) {
    return testApp.app.inject({ method, url, headers: { cookie }, ...(body && { payload: body }) });
  }

  async function createCustomer(body: object, cookie = ana): Promise<Customer> {
    const response = await request('POST', '/customers', cookie, body);
    expect(response.statusCode).toBe(201);
    return response.json<Customer>();
  }

  const lastEvent = async () => {
    const all = await testApp.database.db.select().from(events).orderBy(asc(events.seq));
    return all.at(-1);
  };

  describe('alta (REQ-001-02, REQ-001-30)', () => {
    it('la encargada crea un cliente activo con el teléfono normalizado', async () => {
      const juan = await createCustomer({
        username: 'juan',
        password: '1234',
        name: 'Juan Pérez',
        phone: '0412-123.45.67',
      });
      expect(juan).toMatchObject({
        username: 'juan',
        name: 'Juan Pérez',
        phone: '+584121234567',
        status: 'active',
      });
      const event = await lastEvent();
      expect(event).toMatchObject({
        type: 'customer.created',
        actor: { kind: 'staff', name: 'Ana' },
        payload: { customer: { id: juan.id, username: 'juan' }, phone: '+584121234567' },
      });
      // Ni la contraseña ni su hash viajan en el evento (REQ-001-51).
      expect(JSON.stringify(event)).not.toMatch(/password|argon2/i);
    });

    it('rechaza un usuario repetido aunque cambien las mayúsculas', async () => {
      await createCustomer({ username: 'Juan', password: '1234' });
      const response = await request('POST', '/customers', ana, {
        username: 'JUAN',
        password: '1234',
      });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ message: 'Ya existe un cliente con ese usuario' });
    });

    it('rechaza datos no válidos con 400', async () => {
      for (const body of [
        { username: 'juan perez', password: '1234' },
        { username: 'juan', password: '123' },
        { username: 'juan', password: '1234', phone: '+34 612 345 678' },
      ]) {
        expect((await request('POST', '/customers', ana, body)).statusCode).toBe(400);
      }
    });

    it('el dueño no puede crear clientes', async () => {
      const response = await request('POST', '/customers', dueno, {
        username: 'juan',
        password: '1234',
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('búsqueda', () => {
    beforeEach(async () => {
      await createCustomer({ username: 'juan_23', password: '1234', name: 'Juan Pérez' });
      await createCustomer({ username: 'juanx23', password: '1234', phone: '0414-7654321' });
      await createCustomer({ username: 'maria', password: '1234', phone: '0412-1234567' });
    });

    const search = async (query: string) =>
      (await request('GET', `/customers${query}`, dueno)).json<CustomerPage>();
    const usernames = (page: CustomerPage) => page.items.map((c) => c.username);

    it('sin texto lista todos por usuario; el dueño también puede consultar', async () => {
      const page = await search('');
      expect(usernames(page)).toEqual(['juan_23', 'juanx23', 'maria']);
      expect(page.total).toBe(3);
    });

    it('busca por parte del usuario o del nombre, sin distinguir mayúsculas', async () => {
      expect(usernames(await search('?q=JUAN'))).toEqual(['juan_23', 'juanx23']);
      expect(usernames(await search('?q=pérez'))).toEqual(['juan_23']);
    });

    it('el guion bajo se busca tal cual, no como comodín', async () => {
      expect(usernames(await search('?q=n_2'))).toEqual(['juan_23']);
    });

    it('busca por teléfono en formato nacional o internacional', async () => {
      expect(usernames(await search('?q=0412-123'))).toEqual(['maria']);
      expect(usernames(await search('?q=%2B58414765'))).toEqual(['juanx23']);
    });

    it('pagina y devuelve el total', async () => {
      const page = await search('?limit=2&offset=2');
      expect(usernames(page)).toEqual(['maria']);
      expect(page.total).toBe(3);
    });
  });

  describe('estado de la cuenta (REQ-001-04)', () => {
    it('bloquea y emite customer.status_changed', async () => {
      const juan = await createCustomer({ username: 'juan', password: '1234' });
      const response = await request('PATCH', `/customers/${juan.id}/status`, ana, {
        status: 'blocked',
      });
      expect(response.json()).toMatchObject({ status: 'blocked' });
      expect(await lastEvent()).toMatchObject({
        type: 'customer.status_changed',
        actor: { kind: 'staff', name: 'Ana' },
        payload: { customer: { id: juan.id }, from: 'active', to: 'blocked' },
      });
    });

    it('pasa de desactivada a activa y, si el estado no cambia, no emite evento', async () => {
      const juan = await createCustomer({ username: 'juan', password: '1234' });
      await request('PATCH', `/customers/${juan.id}/status`, ana, { status: 'disabled' });
      await request('PATCH', `/customers/${juan.id}/status`, ana, { status: 'active' });
      const before = await lastEvent();
      expect(before).toMatchObject({ payload: { from: 'disabled', to: 'active' } });
      await request('PATCH', `/customers/${juan.id}/status`, ana, { status: 'active' });
      expect((await lastEvent())?.seq).toBe(before?.seq);
    });

    it('el dueño no puede cambiar el estado', async () => {
      const juan = await createCustomer({ username: 'juan', password: '1234' });
      const response = await request('PATCH', `/customers/${juan.id}/status`, dueno, {
        status: 'blocked',
      });
      expect(response.statusCode).toBe(403);
    });

    it('responde 400 con un estado no válido y 404 si el cliente no existe', async () => {
      const juan = await createCustomer({ username: 'juan', password: '1234' });
      const invalid = await request('PATCH', `/customers/${juan.id}/status`, ana, {
        status: 'borrado',
      });
      expect(invalid.statusCode).toBe(400);
      const missing = await request(
        'PATCH',
        '/customers/0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a99/status',
        ana,
        { status: 'blocked' },
      );
      expect(missing.statusCode).toBe(404);
    });
  });
});
