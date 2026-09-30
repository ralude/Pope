import { usd } from '@pope/shared';
import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events, ledger, sessions, sessionTopups } from '../db/schema.js';
import { PcWorld, logout } from '../testing/pc-world.js';

const MINUTE = 60_000;
// 18:00 en Caracas de un lunes: 1,50 USD/h.
const MONDAY = '2026-09-28T22:00:00Z';

describe('cierre anticipado de una sesión temporal (e2e, REQ-001-69)', () => {
  let world: PcWorld;
  let ana: string;

  beforeEach(async () => {
    world = await PcWorld.start(MONDAY);
    ana = await world.cashier();
  });

  afterEach(async () => {
    await world.close();
  });

  async function lastEvent() {
    const all = await world.testApp.database.db.select().from(events).orderBy(asc(events.seq));
    return all.at(-1);
  }

  /** "Carlos" con 30 min pagados, que ya usó 5 y tiene 25 min restantes. */
  async function carlosWith25MinutesLeft() {
    const { pc, session } = await world.openTemporary(ana, 5, 30, 'Carlos');
    await world.run(5, 5 * MINUTE, MINUTE);
    return { pc, session };
  }

  async function storedSession(id: string) {
    const [row] = await world.testApp.database.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id));
    if (!row) {
      throw new Error('No existe la sesión');
    }
    return row;
  }

  /** Nada se devuelve: ni el ledger ni los cobros en caja cambian al cerrar. */
  async function expectNoRefund() {
    expect(await world.testApp.database.db.select().from(ledger)).toEqual([]);
    const topups = await world.testApp.database.db.select().from(sessionTopups);
    expect(topups).toMatchObject([{ seconds: 1800, amountMicros: usd(0.75) }]);
  }

  it('CA-001-09: si el cliente cierra con 25 min restantes, la PC se bloquea y los 25 min se pierden', async () => {
    const { pc, session } = await carlosWith25MinutesLeft();

    expect(await logout(pc)).toEqual({
      type: 'sessionEnded',
      sessionId: session.id,
      reason: 'customer',
    });

    expect(await storedSession(session.id)).toMatchObject({
      status: 'ended',
      endReason: 'customer',
      usedSeconds: 300,
    });
    // El tiempo sobrante queda anotado como perdido: 30 min pagados, 5 usados, 25 sin usar.
    expect(await lastEvent()).toMatchObject({
      type: 'session.ended',
      payload: {
        sessionId: session.id,
        reason: 'customer',
        usage: {
          kind: 'temporary',
          purchasedSeconds: 1800,
          usedSeconds: 300,
          remainingSeconds: 1500,
        },
      },
    });
    await expectNoRefund();
  });

  it('si la cierra el encargado desde el panel, también se pierde el sobrante', async () => {
    const { pc, session } = await carlosWith25MinutesLeft();

    const response = await world.api('POST', `/sessions/${session.id}/close`, ana);

    expect(response.statusCode).toBe(204);
    expect(await pc.next()).toEqual({
      type: 'sessionEnded',
      sessionId: session.id,
      reason: 'staff',
    });
    expect(await lastEvent()).toMatchObject({
      type: 'session.ended',
      actor: { kind: 'staff', name: 'Ana' },
      payload: { reason: 'staff', usage: { kind: 'temporary', remainingSeconds: 1500 } },
    });
    await expectNoRefund();
  });
});
