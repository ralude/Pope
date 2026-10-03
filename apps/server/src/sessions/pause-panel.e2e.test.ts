import { newId, type NodeToPcMessage, type PcMap, usd } from '@pope/shared';
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events, sessionPauses } from '../db/schema.js';
import { devPcId } from '../pcs/dev-pcs.js';
import { loginAsStaff } from '../testing/auth.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import type { PcTestClient } from '../testing/pc-client.js';
import { activeSession, login, PcWorld } from '../testing/pc-world.js';

const MINUTE = 60_000;
// 18:00 en Caracas de un lunes.
const MONDAY = '2026-09-28T22:00:00Z';

const pause = (pc: PcTestClient) => pc.request({ type: 'pause', requestId: 'pause-1' });

function pauseOf(message: NodeToPcMessage) {
  const session = activeSession(message);
  if (session.kind !== 'account') {
    throw new Error('Se esperaba una sesión con cuenta');
  }
  return session.pause;
}

describe('la pausa desde el panel (e2e, REQ-002-13, REQ-002-14, CA-002-08)', () => {
  let world: PcWorld;
  let ana: string;
  let pc: PcTestClient;
  let sessionId: string;

  beforeEach(async () => {
    world = await PcWorld.start(MONDAY);
    ana = await world.cashier();
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(1.5) });
    pc = await world.pc(5);
    sessionId = activeSession(await login(pc, 'juan')).sessionId;
  });

  afterEach(async () => {
    await world.close();
  });

  const db = () => world.testApp.database.db;
  const resumeOf = (id: string, cookie: string | null = ana) =>
    world.api('POST', `/sessions/${id}/resume`, cookie);

  async function map() {
    return (await world.api('GET', '/pcs/map', ana)).json<PcMap>();
  }

  it('CA-002-08: el mapa trae la pausa con su fin y las pausas usadas', async () => {
    await world.run(5, 3 * MINUTE);
    await pause(pc);
    await world.clock.tick(3 * MINUTE);

    const pc05 = (await map()).pcs.find((p) => p.name === 'PC 05');
    expect(pc05?.session).toMatchObject({
      pause: {
        startedAt: '2026-09-28T22:03:00.000Z',
        maxUntil: '2026-09-28T22:18:00.000Z',
        billing: false,
      },
      pausesUsed: { inSession: 1, today: 1 },
    });
  });

  it('sin pausa, el mapa trae pause null; una temporal, además pausesUsed null', async () => {
    await world.openTemporary(ana, 3, 30);
    const pcs = (await map()).pcs;
    expect(pcs.find((p) => p.name === 'PC 05')?.session).toMatchObject({
      pause: null,
      pausesUsed: { inSession: 0, today: 0 },
    });
    expect(pcs.find((p) => p.name === 'PC 03')?.session).toMatchObject({
      pause: null,
      pausesUsed: null,
    });
  });

  it('REQ-002-13: el encargado reanuda y la PC sale de la pausa al momento', async () => {
    await pause(pc);
    await world.run(5, 4 * MINUTE);

    expect((await resumeOf(sessionId)).statusCode).toBe(204);
    expect(pauseOf(await pc.next())).toBeNull();

    const resumed = (await db().select().from(events).orderBy(asc(events.seq))).filter(
      (e) => e.type === 'session.resumed',
    );
    expect(resumed).toMatchObject([
      {
        actor: { kind: 'staff', name: 'Ana' },
        payload: { sessionId, unbilledSeconds: 4 * 60 },
      },
    ]);
    expect(await db().select().from(sessionPauses)).toMatchObject([
      { endReason: 'staff_resumed', endedBy: { kind: 'staff', name: 'Ana' } },
    ]);
    expect((await map()).pcs.find((p) => p.name === 'PC 05')?.session?.pause).toBeNull();
  });

  it('responde 404 si la sesión no existe y 409 si no está en pausa o ya se cerró', async () => {
    expect((await resumeOf(newId())).statusCode).toBe(404);
    const notPaused = await resumeOf(sessionId);
    expect(notPaused.statusCode).toBe(409);
    expect(notPaused.json()).toMatchObject({ message: 'La sesión no está en pausa' });

    await pause(pc);
    await world.api('POST', `/sessions/${sessionId}/close`, ana);
    const closed = await resumeOf(sessionId);
    expect(closed.statusCode).toBe(409);
    expect(closed.json()).toMatchObject({ message: 'La sesión ya está cerrada' });
  });

  it('solo el encargado y el administrador reanudan; el dueño no', async () => {
    await pause(pc);
    const owner = await loginAsStaff(world.testApp, 'duena', 'dueno');
    expect((await resumeOf(sessionId, owner)).statusCode).toBe(403);
    expect((await resumeOf(sessionId, null)).statusCode).toBe(401);
    const admin = await loginAsStaff(world.testApp, 'admin', 'administrador', 'Luis');
    expect((await resumeOf(sessionId, admin)).statusCode).toBe(204);
  });

  it('el encargado cierra una sesión en pausa y la pausa termina con ella', async () => {
    await pause(pc);
    await world.clock.tick(2 * MINUTE);
    expect((await world.api('POST', `/sessions/${sessionId}/close`, ana)).statusCode).toBe(204);
    expect(await pc.next()).toMatchObject({ type: 'sessionEnded', reason: 'staff' });
    expect(await db().select().from(sessionPauses)).toMatchObject([
      { endReason: 'session_closed', endedBy: { kind: 'staff', name: 'Ana' } },
    ]);
    expect((await map()).pcs.find((p) => p.id === devPcId(5))?.session).toBeNull();
  });
});
