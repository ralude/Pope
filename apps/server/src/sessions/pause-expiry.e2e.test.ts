import { type DomainEvent, minutes, type NodeToPcMessage, usd } from '@pope/shared';
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events, sessionPauses } from '../db/schema.js';
import { loginAsStaff } from '../testing/auth.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import type { PcTestClient } from '../testing/pc-client.js';
import { activeSession, heartbeat, login, PcWorld, summary } from '../testing/pc-world.js';
import { PausesService } from './pauses.service.js';

const MINUTE = 60_000;
// 18:00 en Caracas de un lunes: 1,50 USD/h, así que 1,50 USD son 60 min.
const MONDAY = '2026-09-28T22:00:00Z';

const pause = (pc: PcTestClient) => pc.request({ type: 'pause', requestId: 'pause-1' });
const resume = (pc: PcTestClient) => pc.request({ type: 'resume', requestId: 'resume-1' });

function pauseOf(message: NodeToPcMessage) {
  const session = activeSession(message);
  if (session.kind !== 'account') {
    throw new Error('Se esperaba una sesión con cuenta');
  }
  return session.pause;
}

describe('vencimiento de la pausa (e2e, REQ-002-20, REQ-002-22)', () => {
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

  async function playing(username: string, n: number, money = usd(1.5)) {
    await createCustomerWithBalance(world.testApp, username, { moneyMicros: money });
    const pc = await world.pc(n);
    const { sessionId } = activeSession(await login(pc, username));
    return { pc, sessionId };
  }

  async function overrun(value: 'resume_billing' | 'close') {
    const admin = await loginAsStaff(world.testApp, 'admin', 'administrador', 'Luis');
    await world.api('PUT', '/settings', admin, { pauseOverrun: value });
  }

  it('CA-002-05: a los 15 min de pausa vuelve a cobrar, con la PC aún en pausa', async () => {
    const { pc, sessionId } = await playing('juan', 5);
    await world.run(5, 10 * MINUTE);
    await pause(pc);

    await world.run(5, 20 * MINUTE);
    // Al vencer, la PC recibe el `state` con la pausa cobrando.
    const expired = await pc.next();
    expect(pauseOf(expired)).toEqual({
      startedAt: '2026-09-28T22:10:00.000Z',
      maxUntil: '2026-09-28T22:25:00.000Z',
      billing: true,
    });
    expect(summary(expired).remainingSeconds).toBe(minutes(50));
    // De los 20 min en pausa se cobran los 5 de después del vencimiento.
    expect(summary(await heartbeat(pc)).remainingSeconds).toBe(minutes(45));
    expect(await eventsOf('session.pause_expired')).toMatchObject([
      { actor: { kind: 'system' }, payload: { sessionId, action: 'resume_billing' } },
    ]);

    // Al reanudar, lo no cobrado son los 15 min de la pausa, y se sigue cobrando igual.
    expect(pauseOf(await resume(pc))).toBeNull();
    expect(await eventsOf('session.resumed')).toMatchObject([
      { payload: { unbilledSeconds: 15 * 60 } },
    ]);
    await world.run(5, 5 * MINUTE);
    expect(summary(await heartbeat(pc)).remainingSeconds).toBe(minutes(40));
  });

  it('con la opción a) la sesión puede agotarse en pausa, y la pausa termina con ella', async () => {
    const { pc } = await playing('juan', 5, usd(0.075));
    await pause(pc);
    await world.run(5, 15 * MINUTE + 10_000);
    // Al vencer vuelve a correr: con 3 min, primero el aviso de 5 min y luego el `state`.
    expect(await pc.next()).toMatchObject({ type: 'warning', minutesLeft: 5 });
    expect(pauseOf(await pc.next())).toMatchObject({ billing: true });
    // 3 min después del vencimiento se agota, con el aviso de 1 min antes.
    await world.run(5, 3 * MINUTE);
    expect(await pc.next()).toMatchObject({ type: 'warning', minutesLeft: 1 });
    expect(await pc.next()).toMatchObject({ type: 'sessionEnded', reason: 'exhausted' });
    expect(await db().select().from(sessionPauses)).toMatchObject([
      { endReason: 'session_closed', billingResumedAt: new Date('2026-09-28T22:15:00Z') },
    ]);
  });

  it('con la opción b) al vencer se cierra la sesión sin cobrar la pausa', async () => {
    await overrun('close');
    const { pc, sessionId } = await playing('juan', 5);
    await world.run(5, 5 * MINUTE);
    await pause(pc);
    await world.run(5, 16 * MINUTE);

    expect(await pc.next()).toEqual({ type: 'sessionEnded', sessionId, reason: 'pause_expired' });
    const all = (await db().select().from(events).orderBy(asc(events.seq))).map((e) => e.type);
    expect(all.slice(-2)).toEqual(['session.pause_expired', 'session.ended']);
    expect(await eventsOf('session.pause_expired')).toMatchObject([
      { payload: { sessionId, action: 'close' } },
    ]);
    expect(await eventsOf('session.ended')).toMatchObject([
      { payload: { reason: 'pause_expired', usage: { moneySeconds: 5 * 60 } } },
    ]);
    expect(await db().select().from(sessionPauses)).toMatchObject([
      { endReason: 'expired_closed', endedBy: { kind: 'system' } },
    ]);
  });

  it('si el vencimiento aún no se aplicó al reanudar, se aplica antes', async () => {
    const { pc } = await playing('juan', 5);
    await pause(pc);
    // El reloj salta 20 min sin que salte el temporizador.
    world.clock.advance(20 * MINUTE);
    pc.send({ type: 'resume', requestId: 'resume-1' });
    // Primero el `state` del vencimiento, y después la respuesta a la reanudación.
    expect(pauseOf(await pc.next())).toMatchObject({ billing: true });
    const resumed = await pc.next();
    expect(resumed).toMatchObject({ type: 'state', requestId: 'resume-1' });
    expect(pauseOf(resumed)).toBeNull();
    // Se cobran los 5 min de después del vencimiento, no los 15 de la pausa.
    expect(summary(resumed).remainingSeconds).toBe(minutes(55));
    expect(await eventsOf('session.resumed')).toMatchObject([
      { payload: { unbilledSeconds: 15 * 60 } },
    ]);
  });

  it('con la opción b), reanudar una pausa ya vencida cierra la sesión', async () => {
    await overrun('close');
    const { pc, sessionId } = await playing('juan', 5);
    await pause(pc);
    world.clock.advance(20 * MINUTE);
    pc.send({ type: 'resume', requestId: 'resume-1' });
    expect(await pc.next()).toEqual({ type: 'sessionEnded', sessionId, reason: 'pause_expired' });
    expect(await pc.next()).toEqual({ type: 'state', status: 'locked' });
  });

  it('REQ-002-31: al arrancar, el nodo aplica las pausas que vencieron y programa las demás', async () => {
    const juan = await playing('juan', 5);
    await pause(juan.pc);
    world.clock.advance(10 * MINUTE);
    const ana = await playing('ana', 6);
    await pause(ana.pc);
    // El nodo «estuvo apagado» 10 min más: la de juan venció a las 22:15, la de ana no.
    world.clock.advance(10 * MINUTE);

    await world.testApp.app.get(PausesService).onApplicationBootstrap();
    expect(await eventsOf('session.pause_expired')).toMatchObject([
      { payload: { sessionId: juan.sessionId } },
    ]);
    expect(
      await db().select().from(sessionPauses).orderBy(asc(sessionPauses.startedAt)),
    ).toMatchObject([
      { sessionId: juan.sessionId, billingResumedAt: new Date('2026-09-28T22:15:00Z') },
      { sessionId: ana.sessionId, billingResumedAt: null },
    ]);

    // La de ana vence a su hora, las 22:25. Su PC vuelve a latir tras el arranque, como la de
    // un agente real (sin latidos, la sesión se cerraría antes: eso lo trata T09).
    await heartbeat(ana.pc);
    await world.run(6, 6 * MINUTE);
    expect((await eventsOf('session.pause_expired')).map((e) => e.payload)).toMatchObject([
      { sessionId: juan.sessionId },
      { sessionId: ana.sessionId },
    ]);
  });
});
