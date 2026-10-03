import { type DomainEvent, hours, minutes, type NodeToPcMessage, usd } from '@pope/shared';
import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CombosService } from '../combos/combos.service.js';
import { events, sessionPauses, sessions } from '../db/schema.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import type { PcTestClient } from '../testing/pc-client.js';
import {
  activeSession,
  buyCombo,
  heartbeat,
  login,
  logout,
  PcWorld,
  summary,
} from '../testing/pc-world.js';

const MINUTE = 60_000;
// 18:00 en Caracas de un lunes: 1,50 USD/h, así que 1,50 USD son 60 min.
const MONDAY = '2026-09-28T22:00:00Z';
const SYSTEM = { kind: 'system' } as const;

const pause = (pc: PcTestClient) => pc.request({ type: 'pause', requestId: 'pause-1' });
const resume = (pc: PcTestClient) => pc.request({ type: 'resume', requestId: 'resume-1' });

/** La pausa del `state` de una sesión con cuenta. */
function pauseOf(message: NodeToPcMessage) {
  const session = activeSession(message);
  if (session.kind !== 'account') {
    throw new Error('Se esperaba una sesión con cuenta');
  }
  return session.pause;
}

describe('pausar y reanudar desde la PC (e2e, spec 002)', () => {
  let world: PcWorld;

  beforeEach(async () => {
    world = await PcWorld.start(MONDAY);
  });

  afterEach(async () => {
    await world.close();
  });

  const db = () => world.testApp.database.db;

  async function eventsOf(type: DomainEvent['type']) {
    return (await db().select().from(events).orderBy(asc(events.seq))).filter(
      (e) => e.type === type,
    );
  }

  /** Cliente con 60 min de saldo en sesión en la PC 05. */
  async function juanPlaying() {
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(1.5) });
    const pc = await world.pc(5);
    const { sessionId } = activeSession(await login(pc, 'juan'));
    return { pc, sessionId };
  }

  it('CA-002-01: con 60 min, 20 de juego y 10 de pausa, al reanudar quedan 40', async () => {
    const { pc } = await juanPlaying();
    await world.run(5, 20 * MINUTE);

    const paused = await pause(pc);
    expect(paused).toMatchObject({ type: 'state', requestId: 'pause-1' });
    expect(summary(paused).remainingSeconds).toBe(minutes(40));
    expect(pauseOf(paused)).toEqual({
      startedAt: '2026-09-28T22:20:00.000Z',
      maxUntil: '2026-09-28T22:35:00.000Z',
      billing: false,
    });

    // 10 min en pausa, latiendo como siempre: no se cobra nada (REQ-002-03).
    await world.run(5, 10 * MINUTE);
    expect(summary(await heartbeat(pc)).remainingSeconds).toBe(minutes(40));

    const resumed = await resume(pc);
    expect(resumed).toMatchObject({ type: 'state', requestId: 'resume-1' });
    expect(summary(resumed).remainingSeconds).toBe(minutes(40));
    expect(pauseOf(resumed)).toBeNull();

    // Desde la reanudación se vuelve a cobrar.
    await world.run(5, 5 * MINUTE);
    expect(summary(await heartbeat(pc)).remainingSeconds).toBe(minutes(35));
  });

  it('REQ-002-32: pausar y reanudar dejan sus eventos, con el cliente como actor', async () => {
    const { pc, sessionId } = await juanPlaying();
    await world.run(5, 5 * MINUTE);
    await pause(pc);
    await world.run(5, 7 * MINUTE);
    await resume(pc);

    const actor = { kind: 'customer', username: 'juan' };
    expect(await eventsOf('session.paused')).toMatchObject([
      {
        version: 1,
        actor,
        payload: {
          sessionId,
          pc: { name: 'PC 05' },
          pauseNumber: { inSession: 1, today: 1 },
          maxUntil: '2026-09-28T22:20:00.000Z',
        },
      },
    ]);
    expect(await eventsOf('session.resumed')).toMatchObject([
      { version: 1, actor, payload: { sessionId, unbilledSeconds: 7 * 60 } },
    ]);
    expect(await db().select().from(sessionPauses)).toMatchObject([
      {
        sessionId,
        startedAt: new Date('2026-09-28T22:05:00Z'),
        endedAt: new Date('2026-09-28T22:12:00Z'),
        endReason: 'resumed',
        startedBy: actor,
        endedBy: actor,
      },
    ]);
  });

  it('la segunda pausa de la sesión lleva su número', async () => {
    const { pc } = await juanPlaying();
    await pause(pc);
    await resume(pc);
    await pause(pc);
    expect((await eventsOf('session.paused')).map((e) => e.payload)).toMatchObject([
      { pauseNumber: { inSession: 1, today: 1 } },
      { pauseNumber: { inSession: 2, today: 2 } },
    ]);
  });

  it('CA-002-07: una sesión temporal no se puede pausar', async () => {
    const cookie = await world.cashier();
    const { pc } = await world.openTemporary(cookie, 3, 60);
    expect(await pause(pc)).toEqual({
      type: 'error',
      code: 'pause_unavailable',
      message: 'Las sesiones temporales no se pueden pausar',
      requestId: 'pause-1',
    });
    expect(await db().select().from(sessionPauses)).toEqual([]);
  });

  it('una sesión en pausa no vuelve a pausar; reanudar sin pausa no hace nada', async () => {
    const { pc } = await juanPlaying();
    expect(pauseOf(await resume(pc))).toBeNull();
    await pause(pc);
    expect(await pause(pc)).toEqual({
      type: 'error',
      code: 'pause_unavailable',
      message: 'Tu sesión ya está en pausa',
      requestId: 'pause-1',
    });
    expect(await eventsOf('session.paused')).toHaveLength(1);
    expect(await eventsOf('session.resumed')).toEqual([]);
  });

  it('sin sesión no se puede pausar', async () => {
    const pc = await world.pc(4);
    expect(await pause(pc)).toMatchObject({ type: 'error', code: 'no_active_session' });
  });

  it('en pausa, comprar un combo o cambiar la tasa no cobran el tiempo', async () => {
    const combo = await world.testApp.app
      .get(CombosService)
      .create({ name: 'Combo 2 horas', priceMicros: usd(2), seconds: hours(2) }, SYSTEM);
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(5) });
    const pc = await world.pc(5);
    const { sessionId } = activeSession(await login(pc, 'juan'));
    await world.run(5, 10 * MINUTE);
    await pause(pc);
    const usedAtPause = await usage(sessionId);

    await world.run(5, 5 * MINUTE);
    expect(pauseOf(await buyCombo(pc, combo.id))).toMatchObject({ billing: false });
    const cookie = await world.cashier();
    await world.api('POST', '/exchange-rate', cookie, { vesPerUsd: 40_000_000 });
    await world.run(5, 5 * MINUTE);

    expect(await usage(sessionId)).toEqual(usedAtPause);
  });

  async function usage(sessionId: string) {
    const [row] = await db().select().from(sessions).where(eq(sessions.id, sessionId));
    return { combo: row?.comboSecondsUsed, money: row?.moneySeconds };
  }

  it('en pausa no se avisa ni se agota: con 3 min, 12 de pausa y la sesión sigue', async () => {
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(0.075) });
    const pc = await world.pc(5);
    const { sessionId } = activeSession(await login(pc, 'juan'));
    // El aviso de 5 min que tocaba al entrar con 3 min queda sin enviar: la sesión se pausa.
    await pause(pc);

    await world.run(5, 12 * MINUTE);
    // Ningún aviso ni cierre por el camino: lo siguiente que llega es la respuesta al latido.
    expect(summary(await heartbeat(pc)).remainingSeconds).toBe(minutes(3));
    const [row] = await db().select().from(sessions).where(eq(sessions.id, sessionId));
    expect(row?.status).toBe('active');

    // Al reanudar vuelve a correr: llega el aviso pendiente, luego el de 1 min, y se agota.
    pc.send({ type: 'resume', requestId: 'resume-1' });
    expect(await pc.next()).toMatchObject({ type: 'warning', minutesLeft: 5 });
    expect(await pc.next()).toMatchObject({ type: 'state', requestId: 'resume-1' });
    await world.run(5, 2 * MINUTE);
    expect(await pc.next()).toMatchObject({ type: 'warning', minutesLeft: 1 });
    await world.run(5, MINUTE);
    expect(await pc.next()).toMatchObject({ type: 'sessionEnded', reason: 'exhausted' });
  });

  it('cerrar una sesión en pausa cierra también la pausa', async () => {
    const { pc } = await juanPlaying();
    await pause(pc);
    await world.run(5, 3 * MINUTE);
    expect(await logout(pc)).toMatchObject({ type: 'sessionEnded', reason: 'customer' });
    expect(await db().select().from(sessionPauses)).toMatchObject([
      { endReason: 'session_closed', endedAt: new Date('2026-09-28T22:03:00Z') },
    ]);
    // La pausa no se cobró: de 60 min solo se gastaron 0.
    const [ended] = await eventsOf('session.ended');
    expect(ended?.payload).toMatchObject({ usage: { moneySeconds: 0 } });
  });
});
