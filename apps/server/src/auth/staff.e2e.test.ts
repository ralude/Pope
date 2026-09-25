import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events } from '../db/schema.js';
import { createTestApp, type TestApp } from '../testing/app.js';
import { createStaffService } from '../testing/staff.js';
import { STAFF_COOKIE } from './staff-cookie.js';

describe('gestión del personal (e2e, T14d, REQ-001-40)', () => {
  let testApp: TestApp;
  let adminCookie: string;

  beforeEach(async () => {
    testApp = await createTestApp('local');
    const staff = createStaffService(testApp.database);
    await staff.create(
      { username: 'admin', displayName: 'Gerardo', role: 'administrador', password: 'secreto' },
      { kind: 'system' },
    );
    adminCookie = await sessionCookie('admin', 'secreto');
  });

  afterEach(async () => {
    await testApp.close();
  });

  async function sessionCookie(username: string, password: string): Promise<string> {
    const response = await testApp.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username, password },
    });
    const cookie = response.cookies.find((c) => c.name === STAFF_COOKIE);
    if (!cookie) {
      throw new Error(`No se pudo iniciar sesión como ${username}`);
    }
    return `${STAFF_COOKIE}=${cookie.value}`;
  }

  function request(method: 'GET' | 'POST' | 'PATCH', url: string, cookie: string, body?: object) {
    return testApp.app.inject({ method, url, headers: { cookie }, ...(body && { payload: body }) });
  }

  const createAna = (cookie = adminCookie) =>
    request('POST', '/staff', cookie, {
      username: 'ana',
      displayName: 'Ana',
      role: 'encargado',
      password: 'clave',
    });

  const lastEvent = async () => {
    const all = await testApp.database.db.select().from(events).orderBy(asc(events.seq));
    return all.at(-1);
  };

  it('el administrador da de alta a una encargada y queda el evento con él como actor', async () => {
    const response = await createAna();
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ username: 'ana', role: 'encargado', active: true });
    expect(await lastEvent()).toMatchObject({
      type: 'staff.created',
      actor: { kind: 'staff', name: 'Gerardo' },
      payload: { name: 'Ana', role: 'encargado' },
    });
    // La encargada ya puede iniciar sesión.
    await expect(sessionCookie('ana', 'clave')).resolves.toContain(STAFF_COOKIE);
  });

  it('rechaza un usuario repetido con 409 y un cuerpo no válido con 400', async () => {
    await createAna();
    expect((await createAna()).statusCode).toBe(409);
    const invalid = await request('POST', '/staff', adminCookie, { username: 'x', role: 'jefe' });
    expect(invalid.statusCode).toBe(400);
  });

  it('lista todo el personal por orden de alta', async () => {
    await createAna();
    const response = await request('GET', '/staff', adminCookie);
    expect(response.statusCode).toBe(200);
    expect(response.json<{ username: string }[]>().map((m) => m.username)).toEqual([
      'admin',
      'ana',
    ]);
  });

  it('solo el administrador gestiona el personal', async () => {
    await createAna();
    const anaCookie = await sessionCookie('ana', 'clave');
    expect((await request('GET', '/staff', anaCookie)).statusCode).toBe(403);
    expect(
      (
        await request('POST', '/staff', anaCookie, {
          username: 'b',
          displayName: 'B',
          role: 'administrador',
          password: 'x',
        })
      ).statusCode,
    ).toBe(403);
  });

  it('al desactivar, su sesión deja de valer y queda staff.status_changed', async () => {
    const ana = (await createAna()).json<{ id: string }>();
    const anaCookie = await sessionCookie('ana', 'clave');

    const response = await request('PATCH', `/staff/${ana.id}/status`, adminCookie, {
      active: false,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ active: false });
    expect(await lastEvent()).toMatchObject({
      type: 'staff.status_changed',
      actor: { kind: 'staff', name: 'Gerardo' },
      payload: { staff: { id: ana.id, username: 'ana' }, from: 'active', to: 'inactive' },
    });
    expect((await request('GET', '/auth/me', anaCookie)).statusCode).toBe(401);
  });

  it('al reactivar, las cookies antiguas no vuelven a valer, pero puede entrar de nuevo', async () => {
    const ana = (await createAna()).json<{ id: string }>();
    const oldCookie = await sessionCookie('ana', 'clave');
    await request('PATCH', `/staff/${ana.id}/status`, adminCookie, { active: false });
    await request('PATCH', `/staff/${ana.id}/status`, adminCookie, { active: true });

    expect(await lastEvent()).toMatchObject({ payload: { from: 'inactive', to: 'active' } });
    expect((await request('GET', '/auth/me', oldCookie)).statusCode).toBe(401);
    await expect(sessionCookie('ana', 'clave')).resolves.toContain(STAFF_COOKIE);
  });

  it('si el estado no cambia, no emite evento', async () => {
    const ana = (await createAna()).json<{ id: string }>();
    const before = await lastEvent();
    await request('PATCH', `/staff/${ana.id}/status`, adminCookie, { active: true });
    expect((await lastEvent())?.seq).toBe(before?.seq);
  });

  it('responde 400 con un id no válido y 404 si no existe', async () => {
    const invalid = await request('PATCH', '/staff/123/status', adminCookie, { active: false });
    expect(invalid.statusCode).toBe(400);
    const missing = await request(
      'PATCH',
      '/staff/0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a99/status',
      adminCookie,
      { active: false },
    );
    expect(missing.statusCode).toBe(404);
  });
});
