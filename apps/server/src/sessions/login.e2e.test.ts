import { usd } from '@pope/shared';
import { asc } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { MAX_FAILED_LOGINS } from '../customers/customer-auth.service.js';
import { CustomersService } from '../customers/customers.service.js';
import { events } from '../db/schema.js';
import { devPcId } from '../pcs/dev-pcs.js';
import { loginAsStaff } from '../testing/auth.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { PcTestClient } from '../testing/pc-client.js';
import { heartbeat, login, PcWorld, summary } from '../testing/pc-world.js';

// 18:00 en Caracas (UTC−4) de cada día de la semana usado en los criterios.
const MONDAY = '2026-09-28T22:00:00Z';
const THURSDAY = '2026-10-01T22:00:00Z';
const SUNDAY = '2026-10-04T22:00:00Z';

describe('login desde la PC (e2e, REQ-001-20, REQ-001-21)', () => {
  let world: PcWorld;

  async function start(at: string) {
    world = await PcWorld.start(at);
    return world.testApp;
  }

  afterEach(async () => {
    await world.close();
  });

  it('CA-001-01: con 3,00 USD un lunes, la PC se desbloquea con 2:00:00 y 3,00 USD', async () => {
    const testApp = await start(MONDAY);
    await createCustomerWithBalance(testApp, 'juan', { moneyMicros: usd(3) });
    const state = await login(await world.pc(5), 'juan');
    expect(summary(state)).toEqual({
      remainingSeconds: 7200,
      money: usd(3),
      comboSeconds: 0,
      rate: usd(1.5),
    });
    const all = await testApp.database.db.select().from(events).orderBy(asc(events.seq));
    expect(all.at(-1)).toMatchObject({
      type: 'session.started',
      actor: { kind: 'customer', username: 'juan' },
      payload: {
        kind: 'account',
        pc: { id: devPcId(5), name: 'PC 05' },
        customer: { username: 'juan' },
        rate: { micros: usd(1.5), currency: 'USD' },
      },
    });
  });

  it('CA-001-13: con 3,00 USD un jueves, muestra 1:30:00 y 3,00 USD', async () => {
    const testApp = await start(THURSDAY);
    await createCustomerWithBalance(testApp, 'juan', { moneyMicros: usd(3) });
    expect(summary(await login(await world.pc(5), 'juan'))).toMatchObject({
      remainingSeconds: 5400,
      money: usd(3),
    });
  });

  it('CA-001-16: combo 0:30:00 y 3,00 USD un jueves dan un total de 2:00:00', async () => {
    const testApp = await start(THURSDAY);
    await createCustomerWithBalance(testApp, 'juan', { moneyMicros: usd(3), comboSeconds: 1800 });
    expect(summary(await login(await world.pc(5), 'juan'))).toEqual({
      remainingSeconds: 7200,
      money: usd(3),
      comboSeconds: 1800,
      rate: usd(2),
    });
  });

  it('CA-001-02: con sesión en la PC 03, el login en la PC 07 se rechaza', async () => {
    const testApp = await start(MONDAY);
    await createCustomerWithBalance(testApp, 'juan', { moneyMicros: usd(3) });
    await login(await world.pc(3), 'juan');
    expect(await login(await world.pc(7), 'JUAN')).toEqual({
      type: 'error',
      code: 'session_already_active',
      message: 'Ya tienes una sesión abierta en la PC 03',
      requestId: 'login-1',
    });
  });

  it('CA-001-21: un cambio de tarifa no afecta a la sesión en curso, sí a las siguientes', async () => {
    const testApp = await start(SUNDAY);
    await createCustomerWithBalance(testApp, 'juan', { moneyMicros: usd(6) });
    await createCustomerWithBalance(testApp, 'maria', { moneyMicros: usd(6) });
    const pc5 = await world.pc(5);
    expect(summary(await login(pc5, 'juan')).rate).toBe(usd(2));

    const admin = await loginAsStaff(testApp, 'admin', 'administrador');
    await testApp.app.inject({
      method: 'PUT',
      url: '/tariffs',
      headers: { cookie: admin },
      payload: { weekdays: [7], rateMicrosPerHour: usd(3) },
    });

    expect(summary(await heartbeat(pc5)).rate).toBe(usd(2));
    expect(summary(await login(await world.pc(6), 'maria')).rate).toBe(usd(3));
  });

  it('necesita saldo para al menos 1 minuto (REQ-001-20)', async () => {
    const testApp = await start(MONDAY);
    // 0,02 USD a 1,50 USD/h son 48 s; 0,025 USD son 60 s justos.
    await createCustomerWithBalance(testApp, 'poco', { moneyMicros: usd(0.02) });
    await createCustomerWithBalance(testApp, 'justo', { moneyMicros: usd(0.025) });
    await createCustomerWithBalance(testApp, 'combo', { comboSeconds: 60 });
    expect(await login(await world.pc(1), 'poco')).toMatchObject({
      type: 'error',
      code: 'insufficient_balance',
      message: 'No tienes saldo para 1 minuto. Recarga en el mostrador',
    });
    expect(summary(await login(await world.pc(2), 'justo')).remainingSeconds).toBe(60);
    expect(summary(await login(await world.pc(3), 'combo')).remainingSeconds).toBe(60);
  });

  it('da un mensaje distinto para cada motivo de rechazo', async () => {
    const testApp = await start(MONDAY);
    const juan = await createCustomerWithBalance(testApp, 'juan', { moneyMicros: usd(3) });
    await createCustomerWithBalance(testApp, 'luis', { moneyMicros: usd(3) });
    const client = await world.pc(5);
    expect(await login(client, 'juan', 'mala')).toMatchObject({
      code: 'invalid_credentials',
      message: 'Usuario o contraseña incorrectos',
    });
    await testApp.app.get(CustomersService).setStatus(juan.id, 'blocked', { kind: 'system' });
    expect(await login(client, 'juan')).toMatchObject({
      code: 'account_inactive',
      message: 'Tu cuenta está bloqueada. Habla con el encargado',
    });
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
      await login(client, 'luis', 'mala');
    }
    expect(await login(client, 'luis')).toMatchObject({
      code: 'account_locked',
      message: 'Demasiados intentos fallidos. Prueba de nuevo en 5 min',
    });
  });

  it('una PC con sesión no admite otro login, y la sesión se ve al reconectar', async () => {
    const testApp = await start(MONDAY);
    await createCustomerWithBalance(testApp, 'juan', { moneyMicros: usd(3) });
    await createCustomerWithBalance(testApp, 'maria', { moneyMicros: usd(3) });
    const client = await world.pc(5);
    await login(client, 'juan');
    expect(await login(client, 'maria')).toMatchObject({
      code: 'session_already_active',
      message: 'Esta PC ya tiene una sesión abierta',
    });
    client.close();
    const { pc: again, state } = await PcTestClient.hello(world.url, devPcId(5));
    expect(summary(state).remainingSeconds).toBe(7200);
    again.close();
  });
});
