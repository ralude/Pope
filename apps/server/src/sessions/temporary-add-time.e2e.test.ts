import { newId, type TemporarySession, usd } from '@pope/shared';
import { asc, eq } from 'drizzle-orm';
import type { LightMyRequestResponse } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events, sessions, sessionTopups } from '../db/schema.js';
import { devPcId } from '../pcs/dev-pcs.js';
import { loginAsStaff } from '../testing/auth.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { login, PcWorld } from '../testing/pc-world.js';
import { SessionsService } from './sessions.service.js';

const MINUTE = 60_000;
// 18:00 en Caracas de un lunes: 1,50 USD/h.
const MONDAY = '2026-09-28T22:00:00Z';
// 23:00 del miércoles en Caracas (1,50 USD/h); 90 min después ya es jueves (2,00 USD/h).
const WEDNESDAY_NIGHT = '2026-10-01T03:00:00Z';

describe('añadir tiempo a una sesión temporal (e2e, REQ-001-70)', () => {
  let world: PcWorld;
  let ana: string;
  let shiftId: string;

  async function start(at: string) {
    world = await PcWorld.start(at);
    ana = await loginAsStaff(world.testApp, 'ana', 'encargado', 'Ana');
    const shift = await world.testApp.app.inject({
      method: 'POST',
      url: '/shifts',
      headers: { cookie: ana },
    });
    shiftId = shift.json<{ id: string }>().id;
  }

  beforeEach(async () => {
    await start(MONDAY);
  });

  afterEach(async () => {
    await world.close();
  });

  const request = (method: 'POST', url: string, body: object, cookie: string | null = ana) =>
    world.testApp.app.inject({
      method,
      url,
      headers: cookie ? { cookie } : {},
      payload: body,
    });

  /** Ana abre una sesión temporal en la PC `n`; devuelve la PC conectada y la sesión. */
  async function openTemporary(n: number, minutes: number) {
    const pc = await world.pc(n);
    const response = await request('POST', '/sessions/temporary', {
      pcId: devPcId(n),
      paymentMethod: 'cash_usd',
      name: 'Carlos',
      minutes,
    });
    await pc.next();
    return { pc, session: response.json<TemporarySession>() };
  }

  const addTime = (id: string, body: object, cookie: string | null = ana) =>
    request('POST', `/sessions/${id}/time`, body, cookie);

  it('CA-001-10: con 10 min restantes, cobrar 0,75 USD la deja en 40 min y el cobro va al turno', async () => {
    const { pc, session } = await openTemporary(5, 10);

    const response = await addTime(session.id, { paymentMethod: 'pos', amountMicros: usd(0.75) });

    expect(response.statusCode).toBe(201);
    expect(response.json<TemporarySession>()).toMatchObject({
      id: session.id,
      purchasedSeconds: 2400,
      remainingSeconds: 2400,
      // 0,25 USD de la apertura más 0,75 USD de ahora.
      amountMicros: usd(1),
    });
    // La PC ve el nuevo tiempo al momento.
    expect(await pc.next()).toMatchObject({
      type: 'state',
      session: { kind: 'temporary', purchasedSeconds: 2400, remainingSeconds: 2400 },
    });

    const topups = await world.testApp.database.db
      .select()
      .from(sessionTopups)
      .orderBy(asc(sessionTopups.createdAt), asc(sessionTopups.id));
    expect(
      topups.map(({ seconds, amountMicros, paymentMethod, shiftId: shift }) => ({
        seconds,
        amountMicros,
        paymentMethod,
        shift,
      })),
    ).toEqual([
      { seconds: 600, amountMicros: usd(0.25), paymentMethod: 'cash_usd', shift: shiftId },
      { seconds: 1800, amountMicros: usd(0.75), paymentMethod: 'pos', shift: shiftId },
    ]);
    const all = await world.testApp.database.db.select().from(events).orderBy(asc(events.seq));
    expect(all.at(-1)).toMatchObject({
      type: 'session.time_added',
      actor: { kind: 'staff', name: 'Ana' },
      payload: {
        sessionId: session.id,
        pc: { id: devPcId(5), name: 'PC 05' },
        seconds: 1800,
        amount: { micros: usd(0.75), currency: 'USD' },
        paymentMethod: 'pos',
        shiftId,
      },
    });
  });

  it('con minutos, el importe se redondea al céntimo y se dan los minutos exactos', async () => {
    const { session } = await openTemporary(5, 10);
    const response = await addTime(session.id, { paymentMethod: 'cash_usd', minutes: 25 });
    expect(response.json<TemporarySession>()).toMatchObject({
      purchasedSeconds: 600 + 1500,
      // 0,25 USD de la apertura y 0,625 → 0,63 USD de ahora.
      amountMicros: usd(0.88),
    });
  });

  it('suma al tiempo que queda, no al comprado: primero cobra lo ya usado', async () => {
    const { session } = await openTemporary(5, 10);
    await world.run(5, 4 * MINUTE);

    const response = await addTime(session.id, { paymentMethod: 'cash_usd', minutes: 30 });
    // 10 min comprados, 4 usados y 30 nuevos.
    expect(response.json<TemporarySession>()).toMatchObject({
      purchasedSeconds: 2400,
      remainingSeconds: 2160,
    });
  });

  it('REQ-001-27: con la PC muerta, añadir tiempo no cobra el hueco sin latidos', async () => {
    const { session } = await openTemporary(5, 30);
    await world.run(5, 10 * MINUTE, MINUTE);

    // La PC se apaga y a los 2 min Ana añade 10 min: los 2 min sin latidos no se cuentan.
    world.clock.advance(2 * MINUTE);
    const response = await addTime(session.id, { paymentMethod: 'cash_usd', minutes: 10 });
    expect(response.json<TemporarySession>()).toMatchObject({
      purchasedSeconds: 2400,
      remainingSeconds: 1800,
    });
  });

  it('cobra con la tarifa de la sesión, no con la de hoy', async () => {
    await world.close();
    await start(WEDNESDAY_NIGHT);
    const { session } = await openTemporary(5, 180);
    expect(session.rateMicrosPerHour).toBe(usd(1.5));

    // Ya es jueves (2,00 USD/h), pero 0,75 USD siguen dando 30 min a la tarifa de la sesión.
    await world.run(5, 90 * MINUTE, 60_000);
    const response = await addTime(session.id, {
      paymentMethod: 'cash_usd',
      amountMicros: usd(0.75),
    });
    expect(response.statusCode).toBe(201);
    const [row] = await world.testApp.database.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, session.id));
    expect(row?.purchasedSeconds).toBe(180 * 60 + 1800);
  });

  it('rechaza lo que no se puede añadir, con su mensaje', async () => {
    const { session } = await openTemporary(5, 10);
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    const juanPc = await world.pc(6);
    await login(juanPc, 'juan');
    const [account] = await world.testApp.database.db
      .select()
      .from(sessions)
      .where(eq(sessions.pcId, devPcId(6)));
    const body = { paymentMethod: 'cash_usd', minutes: 30 };
    const message = (response: LightMyRequestResponse) =>
      response.json<{ message: string }>().message;

    const unknown = await addTime(newId(), body);
    expect(unknown.statusCode).toBe(404);
    expect(message(unknown)).toBe('No existe esa sesión');

    const withAccount = await addTime(account?.id ?? '', body);
    expect(withAccount.statusCode).toBe(409);
    expect(message(withAccount)).toBe('Solo las sesiones temporales admiten añadir tiempo');

    expect((await addTime(session.id, { paymentMethod: 'cash_usd' })).statusCode).toBe(400);
    expect((await addTime(session.id, { ...body, amountMicros: usd(1) })).statusCode).toBe(400);
    const tooMuch = await addTime(session.id, {
      paymentMethod: 'cash_usd',
      amountMicros: usd(100),
    });
    expect(tooMuch.statusCode).toBe(400);
    expect(message(tooMuch)).toBe('Como máximo 24 horas por cobro');
    expect((await addTime(session.id, body, null)).statusCode).toBe(401);
    expect(
      (await addTime(session.id, body, await loginAsStaff(world.testApp, 'duena', 'dueno')))
        .statusCode,
    ).toBe(403);
    expect(
      (await addTime(session.id, body, await loginAsStaff(world.testApp, 'admin', 'administrador')))
        .statusCode,
    ).toBe(409);

    // Una sesión ya cerrada no admite más tiempo.
    await world.testApp.app.get(SessionsService).closeByStaff(session.id, { kind: 'system' });
    const ended = await addTime(session.id, body);
    expect(ended.statusCode).toBe(409);
    expect(message(ended)).toBe('La sesión ya terminó');
    expect(await world.testApp.database.db.select().from(sessionTopups)).toHaveLength(1);
  });

  it('un cierre por agotamiento no salta si se acaba de añadir tiempo', async () => {
    const { session } = await openTemporary(5, 10);
    const service = world.testApp.app.get(SessionsService);

    // La sesión tiene tiempo: el cierre por agotamiento se ignora (p. ej. lo decidió un
    // temporizador justo antes de que el encargado añadiera tiempo).
    const closed = await service.close(
      session.id,
      'exhausted',
      { kind: 'system' },
      { billToNow: false, onlyIfExhausted: true },
    );
    expect(closed).toBeNull();
    const [row] = await world.testApp.database.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, session.id));
    expect(row?.status).toBe('active');
  });
});
