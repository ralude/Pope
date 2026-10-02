import type { ExchangeRateStatus } from '@pope/shared';
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events, exchangeRates } from '../db/schema.js';
import { createTestApp, type TestApp } from '../testing/app.js';
import { loginAsStaff } from '../testing/auth.js';
import { FakeClock } from '../testing/clock.js';
import { EventsService } from '../events/events.service.js';
import { ExchangeRatesService } from './exchange-rates.service.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Lunes 5 de octubre de 2026, 15:00 en Caracas.
const MONDAY = '2026-10-05T19:00:00Z';

describe('tasa de cambio manual (e2e, spec 005, REQ-005-33 a REQ-005-35)', () => {
  let clock: FakeClock;
  let testApp: TestApp;
  let ana: string;
  let admin: string;
  let owner: string;

  beforeEach(async () => {
    clock = new FakeClock(MONDAY);
    testApp = await createTestApp('local', [], { clock });
    ana = await loginAsStaff(testApp, 'ana', 'encargado', 'Ana');
    admin = await loginAsStaff(testApp, 'admin', 'administrador', 'Luis');
    owner = await loginAsStaff(testApp, 'duena', 'dueno');
  });

  afterEach(async () => {
    await testApp.close();
  });

  const get = (cookie = ana) =>
    testApp.app.inject({ method: 'GET', url: '/exchange-rate', headers: { cookie } });

  const post = (body: object, cookie = ana) =>
    testApp.app.inject({
      method: 'POST',
      url: '/exchange-rate',
      headers: { cookie },
      payload: body,
    });

  it('sin ninguna tasa, no hay vigente', async () => {
    const response = await get(owner);
    expect(response.statusCode).toBe(200);
    expect(response.json<ExchangeRateStatus>()).toEqual({ rate: null, stale: false });
  });

  it('el encargado guarda una tasa que vale al momento, con su evento (REQ-005-34)', async () => {
    const response = await post({ vesPerUsd: 40_000_000 });
    expect(response.statusCode).toBe(201);
    const expected = {
      rate: {
        vesPerUsd: 40_000_000,
        effectiveDate: '2026-10-05',
        source: 'manual',
        obtainedAt: '2026-10-05T19:00:00.000Z',
        setBy: 'Ana',
      },
      stale: false,
    };
    expect(response.json<ExchangeRateStatus>()).toEqual(expected);
    expect((await get(owner)).json<ExchangeRateStatus>()).toEqual(expected);

    const all = await testApp.database.db.select().from(events).orderBy(asc(events.seq));
    expect(all.filter((e) => e.type === 'exchange_rate.set')).toMatchObject([
      {
        actor: { kind: 'staff', name: 'Ana' },
        payload: { vesPerUsd: 40_000_000, effectiveDate: '2026-10-05', source: 'manual' },
      },
    ]);
  });

  it('el administrador también puede; el dueño solo la ve', async () => {
    expect((await post({ vesPerUsd: 40_000_000 }, admin)).statusCode).toBe(201);
    expect((await post({ vesPerUsd: 41_000_000 }, owner)).statusCode).toBe(403);
    expect((await get(owner)).json<ExchangeRateStatus>().rate?.vesPerUsd).toBe(40_000_000);
  });

  it('una tasa nueva sustituye a la anterior, y la historia se conserva', async () => {
    await post({ vesPerUsd: 40_000_000 });
    clock.advance(HOUR);
    await post({ vesPerUsd: 40_500_000 }, admin);
    expect((await get()).json<ExchangeRateStatus>().rate).toMatchObject({
      vesPerUsd: 40_500_000,
      setBy: 'Luis',
    });
    expect(await testApp.database.db.select().from(exchangeRates)).toHaveLength(2);
  });

  it('rechaza tasas no válidas o con campos de más', async () => {
    for (const body of [
      { vesPerUsd: 0 },
      { vesPerUsd: -40_000_000 },
      { vesPerUsd: 40.5 },
      { vesPerUsd: '40' },
      { vesPerUsd: 10_000_000_000_001 },
      { vesPerUsd: 40_000_000, source: 'bcv' },
      {},
    ]) {
      expect((await post(body)).statusCode).toBe(400);
    }
    expect((await get()).json<ExchangeRateStatus>().rate).toBeNull();
  });

  it('CA-005-05: la tasa del lunes está desactualizada el miércoles (REQ-005-35)', async () => {
    await post({ vesPerUsd: 40_000_000 });
    clock.advance(DAY);
    expect((await get()).json<ExchangeRateStatus>()).toMatchObject({ stale: false });
    clock.advance(DAY);
    expect((await get()).json<ExchangeRateStatus>()).toMatchObject({
      rate: { effectiveDate: '2026-10-05' },
      stale: true,
    });
  });

  it('la tasa guardada sigue vigente tras reiniciar el nodo', async () => {
    await post({ vesPerUsd: 40_000_000 });
    // Un servicio nuevo sobre la misma base de datos, como al arrancar el nodo.
    const restarted = new ExchangeRatesService(
      testApp.database.db,
      testApp.app.get(EventsService),
      clock,
    );
    expect(restarted.current()).toBeNull();
    await restarted.onModuleInit();
    expect(restarted.current()?.vesPerUsd).toBe(40_000_000);
  });
});
