import {
  type DomainEvent,
  newId,
  type PcContinueResponse,
  type PcInstallationCodeResponse,
  type PcRegistrationResponse,
  usd,
} from '@pope/shared';
import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events, sessionHolds, sessionPauses, sessions } from '../db/schema.js';
import { devPcId } from '../pcs/dev-pcs.js';
import { loginAsStaff } from '../testing/auth.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { PcTestClient, useCredential } from '../testing/pc-client.js';
import { activeSession, login, PcWorld } from '../testing/pc-world.js';

// 18:00 en Caracas de un lunes.
const MONDAY = '2026-09-28T22:00:00Z';
const MINUTE = 60_000;

describe('autorizar continuar una sesión retenida (e2e, REQ-003-11, REQ-002-33, CA-002-09, T34f)', () => {
  let world: PcWorld;
  let ana: string;

  beforeEach(async () => {
    world = await PcWorld.start(MONDAY);
    ana = await world.cashier();
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
  });

  afterEach(async () => {
    await world.close();
  });

  const db = () => world.testApp.database.db;
  const post = (n: number, action: string, body: object, cookie: string | null = ana) =>
    world.api('POST', '/pcs/' + devPcId(n) + '/' + action, cookie, body);

  async function eventsOf(type: DomainEvent['type']) {
    return (await db().select().from(events).orderBy(asc(events.seq))).filter(
      (e) => e.type === type,
    );
  }

  /** Revoca la PC 4 con la sesión dada (ya iniciada) y devuelve la PC revinculada y conectada. */
  async function relinked(sessionId: string, connect = true) {
    const issued = (
      await world.api('POST', '/pcs/installation-codes', ana, { pcId: devPcId(4) })
    ).json<PcInstallationCodeResponse>();
    const registered = await world.api('POST', '/pcs/register', null, {
      installationCode: issued.code,
      macAddress: 'AA:BB:CC:DD:EE:04',
    });
    const { credential } = registered.json<PcRegistrationResponse>();
    useCredential(world.url, devPcId(4), credential);
    if (!connect) return null;
    const { pc, state } = await PcTestClient.hello(world.url, devPcId(4), sessionId);
    expect(state).toMatchObject({ status: 'held' });
    return pc;
  }

  it('CA-002-09: una pausa con 8 min vuelve pausada con 8 min tras 20 min de retención, sin otra pausa', async () => {
    const pc = await world.pc(4);
    const sessionId = activeSession(await login(pc, 'juan')).sessionId;
    await pc.request({ type: 'pause', requestId: 'pause-1' });
    await world.clock.tick(7 * MINUTE);
    await post(4, 'revoke', { id: newId() });
    await world.clock.tick(20 * MINUTE);
    const [before] = await db().select().from(sessionPauses);
    const again = await relinked(sessionId);
    if (!again) throw new Error('Sin PC revinculada');

    const response = await post(4, 'continue', { id: newId(), sessionId });
    expect(response.statusCode).toBe(200);
    expect(response.json<PcContinueResponse>()).toEqual({ sessionId, heldSeconds: 20 * 60 });

    // La PC vuelve a su pantalla de pausa con lo que le quedaba (15 − 7 = 8 min).
    const state = await again.next();
    expect(state).toMatchObject({
      type: 'state',
      status: 'active',
      session: { pause: { billing: false, secondsLeft: 8 * 60 } },
    });
    const pauses = await db().select().from(sessionPauses);
    expect(pauses).toHaveLength(1);
    expect(pauses[0]?.endedAt).toBeNull();
    expect(pauses[0]?.maxUntil.getTime()).toBe((before?.maxUntil.getTime() ?? 0) + 20 * MINUTE);
    expect((await db().select().from(sessionHolds))[0]).toMatchObject({
      endReason: 'continued',
      endedBy: { kind: 'staff', name: 'Ana' },
    });
    expect(await eventsOf('session.hold_ended')).toMatchObject([
      {
        actor: { kind: 'staff', name: 'Ana' },
        payload: { sessionId, heldSeconds: 1200, reason: 'continued' },
      },
    ]);

    // Después se aplican sus límites de siempre: vence a los 8 min y vuelve a cobrar.
    await world.clock.tick(8 * MINUTE + 5_000);
    expect((await db().select().from(sessionPauses))[0]?.billingResumedAt).not.toBeNull();
  });

  it('REQ-003-11: una sesión activa sigue activa y solo cobra desde que se autoriza continuar', async () => {
    const pc = await world.pc(4);
    const sessionId = activeSession(await login(pc, 'juan')).sessionId;
    await world.run(4, MINUTE);
    await post(4, 'revoke', { id: newId() });
    await world.clock.tick(30 * MINUTE);
    const again = await relinked(sessionId);
    if (!again) throw new Error('Sin PC revinculada');
    const charged = (await db().select().from(sessions).where(eq(sessions.id, sessionId)))[0]
      ?.moneyChargedMicros;

    expect((await post(4, 'continue', { id: newId(), sessionId })).statusCode).toBe(200);
    expect(await again.next()).toMatchObject({ type: 'state', status: 'active' });
    const after = (await db().select().from(sessions).where(eq(sessions.id, sessionId)))[0];
    expect(after?.status).toBe('active');
    expect(after?.moneyChargedMicros).toBe(charged);

    // Un minuto de uso real después del permiso: se cobra ese minuto y no los 30 de la retención.
    await world.clock.tick(MINUTE);
    again.send({ type: 'heartbeat', sessionId, localRemainingSeconds: null });
    await again.next();
    const billed = (await db().select().from(sessions).where(eq(sessions.id, sessionId)))[0];
    const minuteCost = 1_500_000 / 60;
    expect((billed?.moneyChargedMicros ?? 0) - (charged ?? 0)).toBeLessThan(minuteCost * 1.1);
    expect((billed?.moneyChargedMicros ?? 0) - (charged ?? 0)).toBeGreaterThan(0);
  });

  it('ADR-0020: sin credencial nueva, sin conexión o sin retención, no se continúa', async () => {
    const pc = await world.pc(4);
    const sessionId = activeSession(await login(pc, 'juan')).sessionId;
    await post(4, 'revoke', { id: newId() });
    const early = await post(4, 'continue', { id: newId(), sessionId });
    expect(early.statusCode).toBe(409);
    expect(early.json()).toMatchObject({ code: 'pc_not_relinked' });

    await relinked(sessionId, false);
    const offline = await post(4, 'continue', { id: newId(), sessionId });
    expect(offline.json()).toMatchObject({ code: 'pc_disconnected' });
    expect((await db().select().from(sessionHolds))[0]?.endedAt).toBeNull();

    const free = await post(5, 'continue', { id: newId(), sessionId });
    expect(free.json()).toMatchObject({ code: 'pc_not_held' });
    expect(
      (await world.api('POST', '/pcs/' + newId() + '/continue', ana, { id: newId(), sessionId }))
        .statusCode,
    ).toBe(404);
  });

  it('ADR-0021: continuar dos veces no hace nada la segunda; dueño y sin sesión, no', async () => {
    const pc = await world.pc(4);
    const sessionId = activeSession(await login(pc, 'juan')).sessionId;
    await post(4, 'revoke', { id: newId() });
    const again = await relinked(sessionId);
    expect(again).not.toBeNull();
    const owner = await loginAsStaff(world.testApp, 'eva', 'dueno', 'Eva');
    expect((await post(4, 'continue', { id: newId(), sessionId }, owner)).statusCode).toBe(403);
    expect((await post(4, 'continue', { id: newId(), sessionId }, null)).statusCode).toBe(401);
    expect((await post(4, 'continue', { id: newId(), sessionId })).statusCode).toBe(200);
    const second = await post(4, 'continue', { id: newId(), sessionId });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ code: 'pc_not_held' });
    expect(await eventsOf('session.hold_ended')).toHaveLength(1);
  });

  it('REQ-003-11: el personal puede cerrar la sesión retenida, que no cobra nada más y termina la retención', async () => {
    const pc = await world.pc(4);
    const sessionId = activeSession(await login(pc, 'juan')).sessionId;
    await world.run(4, MINUTE);
    await post(4, 'revoke', { id: newId() });
    await world.clock.tick(15 * MINUTE);
    const charged = (await db().select().from(sessions).where(eq(sessions.id, sessionId)))[0]
      ?.moneyChargedMicros;
    const closed = await world.api('POST', `/sessions/${sessionId}/close`, ana);
    expect(closed.statusCode).toBeLessThan(300);

    const [session] = await db().select().from(sessions).where(eq(sessions.id, sessionId));
    expect(session).toMatchObject({ status: 'ended', endReason: 'staff' });
    expect(session?.moneyChargedMicros).toBe(charged);
    expect((await db().select().from(sessionHolds))[0]).toMatchObject({
      endReason: 'session_closed',
      endedBy: { kind: 'staff', name: 'Ana' },
    });
    expect(await eventsOf('session.hold_ended')).toMatchObject([
      { payload: { sessionId, reason: 'session_closed', heldSeconds: 900 } },
    ]);
  });
});
