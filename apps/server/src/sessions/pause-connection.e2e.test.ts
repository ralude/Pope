import { type NodeToPcMessage, usd } from '@pope/shared';
import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events, sessionPauses, sessions } from '../db/schema.js';
import { devPcId } from '../pcs/dev-pcs.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { PcTestClient } from '../testing/pc-client.js';
import { activeSession, heartbeat, login, PcWorld, summary } from '../testing/pc-world.js';

const MINUTE = 60_000;
// 18:00 en Caracas de un lunes: 1,50 USD/h, así que 1,50 USD son 60 min.
const MONDAY = '2026-09-28T22:00:00Z';

const pause = (pc: PcTestClient) => pc.request({ type: 'pause', requestId: 'pause-1' });

function pauseOf(message: NodeToPcMessage) {
  const session = activeSession(message);
  if (session.kind !== 'account') {
    throw new Error('Se esperaba una sesión con cuenta');
  }
  return session.pause;
}

describe('latidos, cortes y reinicios en pausa (e2e, REQ-002-30, REQ-002-31)', () => {
  let world: PcWorld;
  let pc: PcTestClient;
  let sessionId: string;

  beforeEach(async () => {
    world = await PcWorld.start(MONDAY);
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(1.5) });
    pc = await world.pc(5);
    sessionId = activeSession(await login(pc, 'juan')).sessionId;
    // 5 min de juego, latiendo y nombrando la sesión: la PC ya la conoce.
    await world.run(5, 5 * MINUTE);
  });

  afterEach(async () => {
    await world.close();
  });

  const db = () => world.testApp.database.db;

  async function session() {
    const [row] = await db().select().from(sessions).where(eq(sessions.id, sessionId));
    return row;
  }

  it('REQ-002-30: 10 min sin latidos en pausa y la sesión sigue abierta', async () => {
    await pause(pc);
    // La revisión de sesiones sin latidos pasa cada 10 s; la gracia es de 3 min.
    await world.clock.tick(10 * MINUTE);
    expect((await session())?.status).toBe('active');
    // Al volver, la PC sigue en pausa con su tiempo intacto.
    const state = await heartbeat(pc);
    expect(pauseOf(state)).toMatchObject({ billing: false });
    expect(summary(state).remainingSeconds).toBe(55 * 60);
  });

  it('vencida con a) y sin latidos, se cierra al pasar la gracia y cobra solo lo jugado', async () => {
    await pause(pc);
    // Vence a las 22:20; la gracia de 3 min cuenta desde ahí.
    await world.clock.tick(17 * MINUTE);
    expect((await session())?.status).toBe('active');
    await world.clock.tick(2 * MINUTE);
    expect(await session()).toMatchObject({ status: 'ended', endReason: 'no_heartbeat' });
    const ended = (await db().select().from(events).orderBy(asc(events.seq))).filter(
      (e) => e.type === 'session.ended',
    );
    expect(ended.at(-1)?.payload).toMatchObject({ usage: { moneySeconds: 5 * 60 } });
    expect(await db().select().from(sessionPauses)).toMatchObject([
      { endReason: 'session_closed' },
    ]);
  });

  it('REQ-002-31: si la PC se reinicia en pausa, no se cierra y vuelve a la pantalla de pausa', async () => {
    await pause(pc);
    pc.close();
    await world.clock.tick(2 * MINUTE);
    // Vuelve la luz: la PC arranca sin sesión.
    const { pc: rebooted, state } = await PcTestClient.hello(world.url, devPcId(5), null);
    try {
      expect(activeSession(state).sessionId).toBe(sessionId);
      expect(pauseOf(state)).toMatchObject({
        startedAt: '2026-09-28T22:05:00.000Z',
        billing: false,
      });
      expect((await session())?.status).toBe('active');
    } finally {
      rebooted.close();
    }
  });

  it('sin pausa, una PC que se reinicia sigue cerrando su sesión (REQ-001-27)', async () => {
    pc.close();
    const { pc: rebooted, state } = await PcTestClient.hello(world.url, devPcId(5), null);
    try {
      expect(state).toEqual({ type: 'sessionEnded', sessionId, reason: 'no_heartbeat' });
      expect(await session()).toMatchObject({ status: 'ended', endReason: 'no_heartbeat' });
    } finally {
      rebooted.close();
    }
  });
});
