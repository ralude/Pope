import {
  type InterruptedSessions,
  newId,
  type TemporaryBackup,
  type TemporarySession,
  usd,
} from '@pope/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sessions } from '../db/schema.js';
import { devPcId } from '../pcs/dev-pcs.js';
import { loginAsStaff } from '../testing/auth.js';
import { logout, PcWorld } from '../testing/pc-world.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
// 18:00 en Caracas de un lunes.
const MONDAY = '2026-09-28T22:00:00Z';

describe('respaldo y sesiones interrumpidas (e2e, REQ-001-64, REQ-001-66, REQ-001-71)', () => {
  let world: PcWorld;
  let ana: string;

  beforeEach(async () => {
    world = await PcWorld.start(MONDAY);
    ana = await world.cashier();
  });

  afterEach(async () => {
    await world.close();
  });

  /** Abre una sesión temporal de 10 min en la PC `n` y la cierra el encargado. */
  async function finished(n: number, name: string): Promise<TemporarySession> {
    const { session } = await world.openTemporary(ana, n, 10, name);
    await world.api('POST', `/sessions/${session.id}/close`, ana);
    world.clock.advance(MINUTE);
    return session;
  }

  /**
   * Abre una sesión de 30 min en la PC `n`, la deja latir 2 min y "se va la luz": la PC
   * deja de latir y el nodo la cierra a los 3 min sin latidos.
   */
  async function interrupted(n: number, name: string): Promise<TemporarySession> {
    const { pc, session } = await world.openTemporary(ana, n, 30, name);
    await world.run(n, 2 * MINUTE, MINUTE);
    pc.close();
    await pc.closed;
    await world.clock.tick(4 * MINUTE);
    return session;
  }

  const backup = async (cookie: string | null = ana) =>
    (await world.api('GET', '/sessions/temporary/backup', cookie)).json<TemporaryBackup>();
  const interruptedList = async (cookie: string | null = ana) =>
    (await world.api('GET', '/sessions/temporary/interrupted', cookie)).json<InterruptedSessions>();
  const namesOn = (result: TemporaryBackup, n: number) =>
    result.sessions.filter((s) => s.pc.id === devPcId(n)).map((s) => s.name);

  it('CA-001-07: con 5 sesiones en la PC 05, el respaldo muestra las 3 últimas con todos sus datos', async () => {
    for (const name of ['S1', 'S2', 'S3', 'S4', 'S5']) {
      await finished(5, name);
    }
    await finished(6, 'T1');

    const result = await backup();

    expect(result.keptPerPc).toBe(3);
    expect(namesOn(result, 5)).toEqual(['S5', 'S4', 'S3']);
    // Cada PC cuenta por separado.
    expect(namesOn(result, 6)).toEqual(['T1']);
    const s5 = result.sessions.find((s) => s.name === 'S5');
    expect(s5).toMatchObject({
      pc: { id: devPcId(5), name: 'PC 05' },
      status: 'ended',
      purchasedSeconds: 600,
      remainingSeconds: 600,
      amountMicros: usd(0.25),
      openedBy: 'Ana',
      endReason: 'staff',
      restoredFrom: null,
      interruption: null,
    });
    expect(s5?.startedAt).toBe('2026-09-28T22:04:00.000Z');
    expect(s5?.endedAt).toBe('2026-09-28T22:04:00.000Z');
  });

  it('el administrador puede ampliar cuántas sesiones se conservan por PC', async () => {
    for (const name of ['S1', 'S2', 'S3', 'S4', 'S5']) {
      await finished(5, name);
    }
    const admin = await loginAsStaff(world.testApp, 'admin', 'administrador');
    await world.api('PUT', '/settings', admin, { temporarySessionsKeptPerPc: 4 });

    const result = await backup();

    expect(result.keptPerPc).toBe(4);
    expect(namesOn(result, 5)).toEqual(['S5', 'S4', 'S3', 'S2']);
  });

  it('las interrumpidas pendientes siguen visibles aunque haya más sesiones nuevas (REQ-001-71)', async () => {
    const cut = await interrupted(5, 'S1');
    for (const name of ['S2', 'S3', 'S4', 'S5']) {
      await finished(5, name);
    }

    const result = await backup();

    // Las 3 últimas y, además, la interrumpida, que es la más antigua.
    expect(namesOn(result, 5)).toEqual(['S5', 'S4', 'S3', 'S1']);
    expect(result.sessions.find((s) => s.id === cut.id)).toMatchObject({
      endReason: 'no_heartbeat',
      remainingSeconds: 1680,
      interruption: {
        status: 'pending',
        // El corte es el último latido, 2 min después de abrirla.
        interruptedAt: '2026-09-28T22:02:00.000Z',
        expiresAt: '2026-09-30T22:02:00.000Z',
        restoredBy: null,
      },
    });
  });

  it('CA-001-11: pasadas 48 h desde el corte, sale de interrumpidas pero sigue en el respaldo como caducada', async () => {
    const cut = await interrupted(5, 'S1');
    const [listed] = (await interruptedList()).sessions;
    expect(listed?.id).toBe(cut.id);
    const expiresAt = new Date(listed?.interruption?.expiresAt ?? '');
    expect(expiresAt.getTime() - Date.parse('2026-09-28T22:02:00Z')).toBe(48 * HOUR);

    // Hasta el instante justo en que se cumplen las 48 h aún se puede; un segundo después, no.
    world.clock.advance(expiresAt.getTime() - world.clock.now().getTime());
    expect((await interruptedList()).sessions).toHaveLength(1);
    world.clock.advance(1000);
    expect((await interruptedList()).sessions).toEqual([]);
    expect((await backup()).sessions[0]).toMatchObject({
      id: cut.id,
      interruption: { status: 'expired' },
    });
  });

  it('CA-001-09: solo aparecen en interrumpidas las cerradas por un corte con tiempo restante', async () => {
    const cut = await interrupted(5, 'Cortada');
    // Cerrada por el encargado, por el cliente y por agotamiento: el tiempo sobrante se pierde.
    await finished(6, 'Encargado');
    const { pc: clientPc } = await world.openTemporary(ana, 7, 10, 'Cliente');
    await logout(clientPc);
    await world.openTemporary(ana, 8, 2, 'Agotada');
    await world.run(8, 3 * MINUTE, MINUTE);
    // Cerrada sin latidos, pero justo cuando ya no le quedaba tiempo.
    await world.testApp.database.db.insert(sessions).values({
      id: newId(),
      pcId: devPcId(9),
      kind: 'temporary',
      tempName: 'Sin sobrante',
      status: 'ended',
      rateMicrosPerHour: usd(1.5),
      startedAt: world.clock.now(),
      lastHeartbeatAt: world.clock.now(),
      endedAt: world.clock.now(),
      endReason: 'no_heartbeat',
      openedBy: { kind: 'system' },
      purchasedSeconds: 600,
      usedSeconds: 600,
    });

    expect((await interruptedList()).sessions.map((s) => s.id)).toEqual([cut.id]);
    // Las demás siguen en el respaldo, sin estado de interrupción.
    const others = (await backup()).sessions.filter((s) => s.id !== cut.id);
    expect(others.map((s) => s.name).sort()).toEqual([
      'Agotada',
      'Cliente',
      'Encargado',
      'Sin sobrante',
    ]);
    expect(others.every((s) => s.interruption === null)).toBe(true);
  });

  it('las interrumpidas van de la que se cortó más reciente a la más antigua', async () => {
    const first = await interrupted(5, 'Primera');
    const second = await interrupted(6, 'Segunda');
    expect((await interruptedList()).sessions.map((s) => s.id)).toEqual([second.id, first.id]);
  });

  it('todo el personal puede consultarlo, también el dueño; sin sesión no', async () => {
    await finished(5, 'S1');
    const owner = await loginAsStaff(world.testApp, 'duena', 'dueno');

    expect((await world.api('GET', '/sessions/temporary/backup', owner)).statusCode).toBe(200);
    expect((await world.api('GET', '/sessions/temporary/interrupted', owner)).statusCode).toBe(200);
    expect((await world.api('GET', '/sessions/temporary/backup', null)).statusCode).toBe(401);
    expect((await world.api('GET', '/sessions/temporary/interrupted', null)).statusCode).toBe(401);
  });
});
