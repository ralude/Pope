import { newId, type TemporarySession, usd } from '@pope/shared';
import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events, sessions, sessionTopups } from '../db/schema.js';
import { devPcId } from '../pcs/dev-pcs.js';
import { loginAsStaff } from '../testing/auth.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { buyCombo, login, PcWorld } from '../testing/pc-world.js';
import { NO_OPENING_CASH, NOTHING_COUNTED } from '../testing/shifts.js';

const MINUTE = 60_000;
// 18:00 en Caracas de un lunes (1,50 USD/h) y de un jueves (2,00 USD/h).
const MONDAY = '2026-09-28T22:00:00Z';
const THURSDAY = '2026-10-01T22:00:00Z';

describe('abrir sesión temporal (e2e, REQ-001-22, REQ-001-60, REQ-001-61, REQ-001-62)', () => {
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
      payload: NO_OPENING_CASH,
    });
    shiftId = shift.json<{ id: string }>().id;
  }

  beforeEach(async () => {
    await start(MONDAY);
  });

  afterEach(async () => {
    await world.close();
  });

  const open = (body: object, cookie: string | null = ana) =>
    world.testApp.app.inject({
      method: 'POST',
      url: '/sessions/temporary',
      headers: cookie ? { cookie } : {},
      payload: body,
    });

  const on = (n: number) => ({ pcId: devPcId(n), paymentMethod: 'cash_usd' });

  async function lastEvent() {
    const all = await world.testApp.database.db.select().from(events).orderBy(asc(events.seq));
    return all.at(-1);
  }

  it('CA-001-05: una hora para "Carlos": la PC se desbloquea con 1:00:00 y el cobro va al turno de Ana', async () => {
    const pc = await world.pc(5);
    const response = await open({ ...on(5), name: 'Carlos', minutes: 60 });

    expect(response.statusCode).toBe(201);
    const session = response.json<TemporarySession>();
    expect(session).toMatchObject({
      name: 'Carlos',
      pc: { id: devPcId(5), name: 'PC 05' },
      status: 'active',
      purchasedSeconds: 3600,
      remainingSeconds: 3600,
      amountMicros: usd(1.5),
      rateMicrosPerHour: usd(1.5),
      openedBy: 'Ana',
      restoredFrom: null,
    });
    expect(await pc.next()).toEqual({
      type: 'state',
      status: 'active',
      vesRate: null,
      session: {
        kind: 'temporary',
        sessionId: session.id,
        startedAt: world.clock.now().toISOString(),
        name: 'Carlos',
        purchasedSeconds: 3600,
        remainingSeconds: 3600,
      },
    });

    const topups = await world.testApp.database.db.select().from(sessionTopups);
    expect(topups).toMatchObject([
      {
        sessionId: session.id,
        seconds: 3600,
        amountMicros: usd(1.5),
        paymentMethod: 'cash_usd',
        shiftId,
        actor: { kind: 'staff', name: 'Ana' },
      },
    ]);
  });

  it('CA-001-04: 30 min sin nombre en la PC 05: figura como abierta por Ana, en la sesión y en el evento', async () => {
    await world.pc(5);
    const response = await open({ ...on(5), minutes: 30 });

    expect(response.json<TemporarySession>()).toMatchObject({
      name: 'Temporal · PC 05 · 18:00',
      openedBy: 'Ana',
      amountMicros: usd(0.75),
    });
    const [stored] = await world.testApp.database.db.select().from(sessions);
    expect(stored?.openedBy).toMatchObject({ kind: 'staff', name: 'Ana' });
    expect(await lastEvent()).toMatchObject({
      type: 'session.started',
      actor: { kind: 'staff', name: 'Ana' },
      payload: {
        kind: 'temporary',
        pc: { id: devPcId(5), name: 'PC 05' },
        name: 'Temporal · PC 05 · 18:00',
        rate: { micros: usd(1.5), currency: 'USD' },
        purchasedSeconds: 1800,
        amount: { micros: usd(0.75), currency: 'USD' },
        payment: { method: 'cash_usd', amount: { micros: usd(0.75), currency: 'USD' } },
        shiftId,
      },
    });
  });

  it('con minutos redondea el importe al céntimo; con importe, cobra ese importe', async () => {
    await world.pc(5);
    await world.pc(6);
    // 25 min a 1,50 USD/h = 0,625 → 0,63 USD, con los 1500 s exactos.
    expect((await open({ ...on(5), minutes: 25 })).json<TemporarySession>()).toMatchObject({
      purchasedSeconds: 1500,
      amountMicros: usd(0.63),
    });
    // 0,07 USD a 1,50 USD/h son 168 s, y se cobran los 0,07 USD indicados.
    expect(
      (await open({ ...on(6), amountMicros: usd(0.07) })).json<TemporarySession>(),
    ).toMatchObject({ purchasedSeconds: 168, amountMicros: usd(0.07) });
  });

  it('el importe va en céntimos enteros: medio céntimo no se puede cobrar', async () => {
    await world.pc(5);
    const response = await open({ ...on(5), amountMicros: 5000 });
    expect(response.statusCode).toBe(400);
    expect(response.body).toContain('El importe va en céntimos enteros');
    expect(await world.testApp.database.db.select().from(sessionTopups)).toEqual([]);
  });

  it('cobra con la tarifa del día y la sesión se queda con ella (REQ-001-14)', async () => {
    await world.close();
    await start(THURSDAY);
    await world.pc(5);
    expect((await open({ ...on(5), minutes: 30 })).json<TemporarySession>()).toMatchObject({
      rateMicrosPerHour: usd(2),
      amountMicros: usd(1),
    });
  });

  it('CA-001-18: una sesión temporal no puede comprar combos', async () => {
    const pc = await world.pc(5);
    await open({ ...on(5), minutes: 30 });
    await pc.next();
    expect(await buyCombo(pc, newId())).toMatchObject({
      type: 'error',
      code: 'no_active_session',
      message: 'Los combos son solo para clientes con cuenta',
    });
  });

  it('REQ-001-62: al agotarse el tiempo pagado, la sesión se cierra y la PC se bloquea', async () => {
    const pc = await world.pc(5);
    const { id } = (await open({ ...on(5), minutes: 2 })).json<TemporarySession>();
    await pc.next();

    await world.run(5, 2 * MINUTE + 100);
    expect(await pc.next()).toMatchObject({ type: 'warning', minutesLeft: 5 });
    expect(await pc.next()).toMatchObject({ type: 'warning', minutesLeft: 1 });
    expect(await pc.next()).toEqual({ type: 'sessionEnded', sessionId: id, reason: 'exhausted' });
    const [row] = await world.testApp.database.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id));
    expect(row).toMatchObject({ status: 'ended', endReason: 'exhausted', usedSeconds: 120 });
  });

  it('rechaza lo que no se puede abrir, con su mensaje', async () => {
    await world.pc(5);
    const busy = await world.pc(3);
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    await login(busy, 'juan');

    const rejected = async (body: object, status: number, message?: string) => {
      const response = await open(body);
      expect(response.statusCode).toBe(status);
      if (message) {
        expect(response.json<{ message: string }>().message).toBe(message);
      }
    };
    await rejected({ ...on(3), minutes: 30 }, 409, 'La PC 03 ya tiene una sesión abierta');
    await rejected({ ...on(6), minutes: 30 }, 409, 'La PC 06 no está conectada al nodo');
    await rejected({ ...on(5), minutes: 30, pcId: newId() }, 404, 'No existe esa PC');
    await rejected({ ...on(5), amountMicros: usd(100) }, 400, 'Como máximo 24 horas por cobro');
    await rejected({ ...on(5) }, 400);
    await rejected({ ...on(5), minutes: 30, amountMicros: usd(1) }, 400);
    expect(await world.testApp.database.db.select().from(sessionTopups)).toEqual([]);
  });

  it('exige un turno abierto y un rol que cobre', async () => {
    await world.pc(5);
    const owner = await loginAsStaff(world.testApp, 'duena', 'dueno');
    const admin = await loginAsStaff(world.testApp, 'admin', 'administrador');

    expect((await open({ ...on(5), minutes: 30 }, null)).statusCode).toBe(401);
    expect((await open({ ...on(5), minutes: 30 }, owner)).statusCode).toBe(403);
    // El administrador cobra en la caja que abrió Ana: la caja es del local (REQ-005-44).
    expect((await open({ ...on(5), minutes: 30 }, admin)).statusCode).toBe(201);
    // Sin caja abierta no se cobra.
    await world.pc(6);
    await world.testApp.app.inject({
      method: 'POST',
      url: '/shifts/current/close',
      headers: { cookie: ana },
      payload: NOTHING_COUNTED,
    });
    const noShift = await open({ ...on(6), minutes: 30 });
    expect(noShift.statusCode).toBe(409);
    expect(noShift.json<{ message: string }>().message).toBe(
      'Abre un turno de caja para continuar',
    );
  });
});
