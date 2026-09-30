import { type TariffTable, usd } from '@pope/shared';
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events } from '../db/schema.js';
import { createTestApp, type TestApp } from '../testing/app.js';
import { loginAsStaff } from '../testing/auth.js';
import { TariffsService } from './tariffs.service.js';

/** Tabla como lista de precios de lunes a domingo, en USD. */
const prices = (table: TariffTable) => table.map((day) => day.rateMicrosPerHour / 1_000_000);

describe('tarifa semanal (e2e, REQ-001-10, REQ-001-15)', () => {
  let testApp: TestApp;
  let admin: string;
  let ana: string;

  beforeEach(async () => {
    testApp = await createTestApp('local');
    admin = await loginAsStaff(testApp, 'admin', 'administrador', 'Luis');
    ana = await loginAsStaff(testApp, 'ana', 'encargado', 'Ana');
  });

  afterEach(async () => {
    await testApp.close();
  });

  const getTable = async (cookie = ana) =>
    (
      await testApp.app.inject({ method: 'GET', url: '/tariffs', headers: { cookie } })
    ).json<TariffTable>();

  const put = (body: object, cookie = admin) =>
    testApp.app.inject({ method: 'PUT', url: '/tariffs', headers: { cookie }, payload: body });

  const tariffEvents = async () =>
    (await testApp.database.db.select().from(events).orderBy(asc(events.seq))).filter(
      (e) => e.type === 'tariff.changed',
    );

  it('empieza con lunes–miércoles 1,50 y jueves–domingo 2,00, visible para el personal', async () => {
    expect(prices(await getTable())).toEqual([1.5, 1.5, 1.5, 2, 2, 2, 2]);
  });

  it('CA-001-20: dos guardados dejan lunes–jueves 1,50, viernes–sábado 2,00 y domingo 3,00', async () => {
    const first = await put({ weekdays: [1, 2, 3, 4], rateMicrosPerHour: usd(1.5) });
    expect(first.statusCode).toBe(200);
    const second = await put({ weekdays: [7], rateMicrosPerHour: usd(3) });
    expect(prices(second.json<TariffTable>())).toEqual([1.5, 1.5, 1.5, 1.5, 2, 2, 3]);

    const changes = await tariffEvents();
    expect(changes).toHaveLength(2);
    // Solo figuran los días que cambian, con el precio anterior y el nuevo.
    expect(changes[0]).toMatchObject({
      actor: { kind: 'staff', name: 'Luis' },
      payload: {
        changes: [
          {
            weekday: 4,
            from: { micros: usd(2), currency: 'USD' },
            to: { micros: usd(1.5), currency: 'USD' },
          },
        ],
      },
    });
    expect(changes[1]).toMatchObject({
      payload: { changes: [{ weekday: 7, from: { micros: usd(2) }, to: { micros: usd(3) } }] },
    });
  });

  it('guardar sin cambios no emite evento', async () => {
    await put({ weekdays: [1, 2], rateMicrosPerHour: usd(1.5) });
    expect(await tariffEvents()).toHaveLength(0);
  });

  it('la tarifa aplicable depende del día en Caracas (04:00 UTC)', async () => {
    const tariffs = testApp.app.get(TariffsService);
    // Miércoles 30-09-2026 23:59 en Caracas = jueves 03:59 UTC.
    expect(await tariffs.rateAt(new Date('2026-10-01T03:59:00Z'))).toBe(usd(1.5));
    expect(await tariffs.rateAt(new Date('2026-10-01T04:00:00Z'))).toBe(usd(2));
  });

  it('solo el administrador cambia la tarifa', async () => {
    const response = await put({ weekdays: [1], rateMicrosPerHour: usd(1) }, ana);
    expect(response.statusCode).toBe(403);
  });

  it('rechaza días o precios no válidos con 400', async () => {
    for (const body of [
      { weekdays: [], rateMicrosPerHour: usd(1) },
      { weekdays: [8], rateMicrosPerHour: usd(1) },
      { weekdays: [1, 1], rateMicrosPerHour: usd(1) },
      { weekdays: [1], rateMicrosPerHour: 0 },
      { weekdays: [1], rateMicrosPerHour: 1.5 },
    ]) {
      expect((await put(body)).statusCode).toBe(400);
    }
  });
});
