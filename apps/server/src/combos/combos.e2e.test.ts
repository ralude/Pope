import { type Combo, hours, usd } from '@pope/shared';
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events } from '../db/schema.js';
import { createTestApp, type TestApp } from '../testing/app.js';
import { loginAsStaff } from '../testing/auth.js';

describe('combos de horas (e2e, REQ-001-80, REQ-001-81)', () => {
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

  function request(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT',
    url: string,
    cookie: string,
    body?: object,
  ) {
    return testApp.app.inject({ method, url, headers: { cookie }, ...(body && { payload: body }) });
  }

  async function createCombo(body: object): Promise<Combo> {
    const response = await request('POST', '/combos', admin, body);
    expect(response.statusCode).toBe(201);
    return response.json<Combo>();
  }

  const lastEvent = async () =>
    (await testApp.database.db.select().from(events).orderBy(asc(events.seq))).at(-1);

  it('CA-001-14: "Combo 20 horas" a 20 USD sale a 1,00 USD/h, un 33 % y un 50 % menos', async () => {
    const combo = await createCombo({
      name: 'Combo 20 horas',
      priceMicros: usd(20),
      seconds: hours(20),
    });
    expect(combo).toMatchObject({
      name: 'Combo 20 horas',
      active: true,
      ratePerHourMicros: usd(1),
    });
    expect(combo.discounts.map((d) => d.discountPercent)).toEqual([33, 33, 33, 50, 50, 50, 50]);
    expect(await lastEvent()).toMatchObject({
      type: 'combo.created',
      actor: { kind: 'staff', name: 'Luis' },
      payload: {
        comboId: combo.id,
        combo: {
          name: 'Combo 20 horas',
          price: { micros: usd(20), currency: 'USD' },
          seconds: hours(20),
          active: true,
        },
      },
    });
  });

  it('el descuento sigue a la tarifa vigente', async () => {
    const combo = await createCombo({
      name: 'Combo 20 horas',
      priceMicros: usd(20),
      seconds: hours(20),
    });
    await request('PUT', '/tariffs', admin, { weekdays: [7], rateMicrosPerHour: usd(4) });
    const fetched = (await request('GET', `/combos/${combo.id}`, ana)).json<Combo>();
    expect(fetched.discounts.at(-1)).toMatchObject({ weekday: 7, discountPercent: 75 });
  });

  it('edita y desactiva con los valores anteriores y los nuevos en el evento', async () => {
    const combo = await createCombo({
      name: 'Combo 10 horas',
      priceMicros: usd(12),
      seconds: hours(10),
    });
    const edited = await request('PATCH', `/combos/${combo.id}`, admin, { priceMicros: usd(10) });
    expect(edited.json<Combo>()).toMatchObject({ priceMicros: usd(10), ratePerHourMicros: usd(1) });
    expect(await lastEvent()).toMatchObject({
      type: 'combo.updated',
      payload: {
        comboId: combo.id,
        before: { price: { micros: usd(12) }, active: true },
        after: { price: { micros: usd(10) }, active: true },
      },
    });

    await request('PATCH', `/combos/${combo.id}`, admin, { active: false });
    expect(await lastEvent()).toMatchObject({
      payload: { before: { active: true }, after: { active: false } },
    });
    const list = (await request('GET', '/combos', ana)).json<Combo[]>();
    expect(list).toEqual([expect.objectContaining({ id: combo.id, active: false })]);
  });

  it('una edición sin cambios no emite evento', async () => {
    const combo = await createCombo({
      name: 'Combo 5 horas',
      priceMicros: usd(6),
      seconds: hours(5),
    });
    const before = await lastEvent();
    await request('PATCH', `/combos/${combo.id}`, admin, { name: 'Combo 5 horas', active: true });
    expect((await lastEvent())?.seq).toBe(before?.seq);
  });

  it('lista primero los activos y de menos a más tiempo', async () => {
    const big = await createCombo({ name: 'Grande', priceMicros: usd(20), seconds: hours(20) });
    const small = await createCombo({ name: 'Pequeño', priceMicros: usd(6), seconds: hours(5) });
    const old = await createCombo({ name: 'Viejo', priceMicros: usd(1), seconds: hours(1) });
    await request('PATCH', `/combos/${old.id}`, admin, { active: false });
    const list = (await request('GET', '/combos', ana)).json<Combo[]>();
    expect(list.map((c) => c.id)).toEqual([small.id, big.id, old.id]);
  });

  it('el encargado consulta pero no crea ni edita; los datos no válidos dan 400 y 404', async () => {
    const combo = await createCombo({ name: 'Combo', priceMicros: usd(6), seconds: hours(5) });
    expect(
      (await request('POST', '/combos', ana, { name: 'X', priceMicros: 1, seconds: 1 })).statusCode,
    ).toBe(403);
    expect((await request('PATCH', `/combos/${combo.id}`, ana, { active: false })).statusCode).toBe(
      403,
    );
    expect(
      (await request('POST', '/combos', admin, { name: 'X', priceMicros: 0, seconds: 60 }))
        .statusCode,
    ).toBe(400);
    expect((await request('PATCH', `/combos/${combo.id}`, admin, {})).statusCode).toBe(400);
    const missing = await request('PATCH', '/combos/0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a99', admin, {
      active: false,
    });
    expect(missing.statusCode).toBe(404);
  });
});
