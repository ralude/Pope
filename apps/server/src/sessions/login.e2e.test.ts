import { type NodeToPcMessage, usd } from '@pope/shared';
import { asc } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { MAX_FAILED_LOGINS } from '../customers/customer-auth.service.js';
import { CustomersService } from '../customers/customers.service.js';
import { events } from '../db/schema.js';
import { devPcId, seedDevPcs } from '../pcs/dev-pcs.js';
import { createTestApp, type TestApp } from '../testing/app.js';
import { loginAsStaff } from '../testing/auth.js';
import { FakeClock } from '../testing/clock.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { listenForPcs, PcTestClient } from '../testing/pc-client.js';

// 18:00 en Caracas (UTC−4) de cada día de la semana usado en los criterios.
const MONDAY = '2026-09-28T22:00:00Z';
const THURSDAY = '2026-10-01T22:00:00Z';
const SUNDAY = '2026-10-04T22:00:00Z';

describe('login desde la PC (e2e, REQ-001-20, REQ-001-21)', () => {
  let testApp: TestApp;
  let url: string;
  const clients: PcTestClient[] = [];

  async function start(at: string) {
    testApp = await createTestApp('local', [], { clock: new FakeClock(at) });
    await seedDevPcs(testApp.database.db);
    url = await listenForPcs(testApp);
  }

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.close();
    }
    await testApp.close();
  });

  async function pc(n: number): Promise<PcTestClient> {
    const { pc: client } = await PcTestClient.hello(url, devPcId(n));
    clients.push(client);
    return client;
  }

  const login = (client: PcTestClient, username: string, password = '1234') =>
    client.request({ type: 'login', username, password, requestId: 'login-1' });

  /** Resumen del `state` de una sesión con cuenta: tiempo total, saldo, combo y tarifa. */
  function summary(message: NodeToPcMessage) {
    if (message.type !== 'state' || message.status !== 'active') {
      throw new Error(`Se esperaba un state activo: ${JSON.stringify(message)}`);
    }
    if (message.session.kind !== 'account') {
      throw new Error('Se esperaba una sesión con cuenta');
    }
    const { remainingSeconds, money, comboSeconds, ratePerHour } = message.session;
    return { remainingSeconds, money: money.micros, comboSeconds, rate: ratePerHour.micros };
  }

  it('CA-001-01: con 3,00 USD un lunes, la PC se desbloquea con 2:00:00 y 3,00 USD', async () => {
    await start(MONDAY);
    await createCustomerWithBalance(testApp, 'juan', { moneyMicros: usd(3) });
    const state = await login(await pc(5), 'juan');
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
    await start(THURSDAY);
    await createCustomerWithBalance(testApp, 'juan', { moneyMicros: usd(3) });
    expect(summary(await login(await pc(5), 'juan'))).toMatchObject({
      remainingSeconds: 5400,
      money: usd(3),
    });
  });

  it('CA-001-16: combo 0:30:00 y 3,00 USD un jueves dan un total de 2:00:00', async () => {
    await start(THURSDAY);
    await createCustomerWithBalance(testApp, 'juan', { moneyMicros: usd(3), comboSeconds: 1800 });
    expect(summary(await login(await pc(5), 'juan'))).toEqual({
      remainingSeconds: 7200,
      money: usd(3),
      comboSeconds: 1800,
      rate: usd(2),
    });
  });

  it('CA-001-02: con sesión en la PC 03, el login en la PC 07 se rechaza', async () => {
    await start(MONDAY);
    await createCustomerWithBalance(testApp, 'juan', { moneyMicros: usd(3) });
    await login(await pc(3), 'juan');
    expect(await login(await pc(7), 'JUAN')).toEqual({
      type: 'error',
      code: 'session_already_active',
      message: 'Ya tienes una sesión abierta en la PC 03',
      requestId: 'login-1',
    });
  });

  it('CA-001-21: un cambio de tarifa no afecta a la sesión en curso, sí a las siguientes', async () => {
    await start(SUNDAY);
    await createCustomerWithBalance(testApp, 'juan', { moneyMicros: usd(6) });
    await createCustomerWithBalance(testApp, 'maria', { moneyMicros: usd(6) });
    const pc5 = await pc(5);
    expect(summary(await login(pc5, 'juan')).rate).toBe(usd(2));

    const admin = await loginAsStaff(testApp, 'admin', 'administrador');
    await testApp.app.inject({
      method: 'PUT',
      url: '/tariffs',
      headers: { cookie: admin },
      payload: { weekdays: [7], rateMicrosPerHour: usd(3) },
    });

    const heartbeat = await pc5.request({
      type: 'heartbeat',
      sessionId: null,
      localRemainingSeconds: null,
    });
    expect(summary(heartbeat).rate).toBe(usd(2));
    expect(summary(await login(await pc(6), 'maria')).rate).toBe(usd(3));
  });

  it('necesita saldo para al menos 1 minuto (REQ-001-20)', async () => {
    await start(MONDAY);
    // 0,02 USD a 1,50 USD/h son 48 s; 0,025 USD son 60 s justos.
    await createCustomerWithBalance(testApp, 'poco', { moneyMicros: usd(0.02) });
    await createCustomerWithBalance(testApp, 'justo', { moneyMicros: usd(0.025) });
    await createCustomerWithBalance(testApp, 'combo', { comboSeconds: 60 });
    expect(await login(await pc(1), 'poco')).toMatchObject({
      type: 'error',
      code: 'insufficient_balance',
      message: 'No tienes saldo para 1 minuto. Recarga en el mostrador',
    });
    expect(summary(await login(await pc(2), 'justo')).remainingSeconds).toBe(60);
    expect(summary(await login(await pc(3), 'combo')).remainingSeconds).toBe(60);
  });

  it('da un mensaje distinto para cada motivo de rechazo', async () => {
    await start(MONDAY);
    const juan = await createCustomerWithBalance(testApp, 'juan', { moneyMicros: usd(3) });
    await createCustomerWithBalance(testApp, 'luis', { moneyMicros: usd(3) });
    const client = await pc(5);
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
    await start(MONDAY);
    await createCustomerWithBalance(testApp, 'juan', { moneyMicros: usd(3) });
    await createCustomerWithBalance(testApp, 'maria', { moneyMicros: usd(3) });
    const client = await pc(5);
    await login(client, 'juan');
    expect(await login(client, 'maria')).toMatchObject({
      code: 'session_already_active',
      message: 'Esta PC ya tiene una sesión abierta',
    });
    client.close();
    const { pc: again, state } = await PcTestClient.hello(url, devPcId(5));
    clients.push(again);
    expect(summary(state).remainingSeconds).toBe(7200);
  });
});
