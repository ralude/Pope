import type { Settings } from '@pope/shared';
import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events, settings } from '../db/schema.js';
import { createTestApp, type TestApp } from '../testing/app.js';
import { loginAsStaff } from '../testing/auth.js';
import { SettingsService } from './settings.service.js';

describe('ajustes del nodo (e2e, REQ-001-27, REQ-001-64)', () => {
  let testApp: TestApp;
  let admin: string;
  let ana: string;
  let owner: string;

  beforeEach(async () => {
    testApp = await createTestApp('local');
    admin = await loginAsStaff(testApp, 'admin', 'administrador', 'Luis');
    ana = await loginAsStaff(testApp, 'ana', 'encargado', 'Ana');
    owner = await loginAsStaff(testApp, 'duena', 'dueno');
  });

  afterEach(async () => {
    await testApp.close();
  });

  const get = (cookie?: string) =>
    testApp.app.inject({ method: 'GET', url: '/settings', headers: cookie ? { cookie } : {} });

  const put = (body: object, cookie = admin) =>
    testApp.app.inject({ method: 'PUT', url: '/settings', headers: { cookie }, payload: body });

  const settingEvents = async () =>
    (await testApp.database.db.select().from(events).orderBy(asc(events.seq))).filter(
      (e) => e.type === 'setting.changed',
    );

  it('sin cambios, valen 3 min de gracia y 3 sesiones temporales por PC', async () => {
    const response = await get(ana);
    expect(response.statusCode).toBe(200);
    expect(response.json<Settings>()).toEqual({
      heartbeatGraceSeconds: 180,
      temporarySessionsKeptPerPc: 3,
    });
  });

  it('el administrador cambia un ajuste y queda un evento con el valor anterior y el nuevo', async () => {
    const response = await put({ heartbeatGraceSeconds: 300 });
    expect(response.statusCode).toBe(200);
    expect(response.json<Settings>()).toEqual({
      heartbeatGraceSeconds: 300,
      temporarySessionsKeptPerPc: 3,
    });
    expect((await get(ana)).json<Settings>().heartbeatGraceSeconds).toBe(300);
    expect(await settingEvents()).toMatchObject([
      {
        actor: { kind: 'staff', name: 'Luis' },
        payload: { key: 'heartbeatGraceSeconds', from: 180, to: 300 },
      },
    ]);
  });

  it('cambiar varios a la vez genera un evento por cada uno, y uno igual no genera ninguno', async () => {
    await put({ heartbeatGraceSeconds: 300, temporarySessionsKeptPerPc: 5 });
    expect((await settingEvents()).map((e) => e.payload)).toEqual([
      { key: 'heartbeatGraceSeconds', from: 180, to: 300 },
      { key: 'temporarySessionsKeptPerPc', from: 3, to: 5 },
    ]);
    await put({ heartbeatGraceSeconds: 300, temporarySessionsKeptPerPc: 4 });
    expect(await settingEvents()).toHaveLength(3);
    expect((await settingEvents()).at(-1)?.payload).toEqual({
      key: 'temporarySessionsKeptPerPc',
      from: 5,
      to: 4,
    });
  });

  it('las sesiones temporales conservadas no pueden bajar de 3', async () => {
    const response = await put({ temporarySessionsKeptPerPc: 2 });
    expect(response.statusCode).toBe(400);
    expect((await get(ana)).json<Settings>().temporarySessionsKeptPerPc).toBe(3);
    expect(await settingEvents()).toEqual([]);
  });

  it('rechaza cuerpos vacíos, ajustes desconocidos y tiempos fuera de rango', async () => {
    expect((await put({})).statusCode).toBe(400);
    expect((await put({ colorFavorito: 'azul' })).statusCode).toBe(400);
    expect((await put({ heartbeatGraceSeconds: 5 })).statusCode).toBe(400);
  });

  it('solo el administrador puede cambiarlos; el resto del personal los lee', async () => {
    expect((await put({ heartbeatGraceSeconds: 300 }, ana)).statusCode).toBe(403);
    expect((await put({ heartbeatGraceSeconds: 300 }, owner)).statusCode).toBe(403);
    expect((await get(owner)).statusCode).toBe(200);
    expect((await get()).statusCode).toBe(401);
    expect(await settingEvents()).toEqual([]);
  });

  it('un valor inválido guardado a mano no tumba el nodo: se usa el valor por defecto', async () => {
    await put({ heartbeatGraceSeconds: 300 });
    await testApp.database.db
      .update(settings)
      .set({ value: 'tres minutos' })
      .where(eq(settings.key, 'heartbeatGraceSeconds'));
    expect(await testApp.app.get(SettingsService).get()).toEqual({
      heartbeatGraceSeconds: 180,
      temporarySessionsKeptPerPc: 3,
    });
  });
});
