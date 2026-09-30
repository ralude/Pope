import {
  newId,
  type InterruptedSessions,
  type TemporaryBackup,
  type TemporarySession,
  usd,
} from '@pope/shared';
import { asc, eq } from 'drizzle-orm';
import type { LightMyRequestResponse } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events, ledger, sessions, sessionTopups } from '../db/schema.js';
import { devPcId } from '../pcs/dev-pcs.js';
import { loginAsStaff } from '../testing/auth.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { login, logout, PcWorld } from '../testing/pc-world.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
// 18:00 en Caracas de un lunes.
const MONDAY = '2026-09-28T22:00:00Z';

describe('restaurar sesiones interrumpidas (e2e, REQ-001-67, REQ-001-68, REQ-001-71)', () => {
  let world: PcWorld;
  let ana: string;

  beforeEach(async () => {
    world = await PcWorld.start(MONDAY);
    ana = await world.cashier();
  });

  afterEach(async () => {
    await world.close();
  });

  /**
   * "Carlos" paga 60 min a las 18:00 en la PC `n`, la usa 20 min y a las 18:20 se va la luz
   * de la PC. El nodo la cierra a los 3 min sin latidos, con 40 min restantes.
   */
  async function carlosCut(n = 5, name = 'Carlos'): Promise<TemporarySession> {
    const { pc, session } = await world.openTemporary(ana, n, 60, name);
    await world.run(n, 20 * MINUTE, MINUTE);
    pc.close();
    await pc.closed;
    await world.clock.tick(4 * MINUTE);
    return session;
  }

  const restore = (id: string, pcNumber: number, cookie: string | null = ana) =>
    world.api('POST', `/sessions/${id}/restore`, cookie, { pcId: devPcId(pcNumber) });

  const message = (response: LightMyRequestResponse) =>
    response.json<{ message: string }>().message;

  async function lastEvent() {
    const all = await world.testApp.database.db.select().from(events).orderBy(asc(events.seq));
    return all.at(-1);
  }

  it('CA-001-06: tras el corte, restaurar en la PC 02 la desbloquea con 40 min y no cobra nada', async () => {
    const carlos = await carlosCut();
    // La luz vuelve a las 18:50 y Ana restaura "Carlos" en la PC 02.
    world.clock.advance(26 * MINUTE);
    const pc2 = await world.pc(2);

    const response = await restore(carlos.id, 2);

    expect(response.statusCode).toBe(201);
    const restored = response.json<TemporarySession>();
    expect(restored).toMatchObject({
      name: 'Carlos',
      pc: { id: devPcId(2), name: 'PC 02' },
      status: 'active',
      purchasedSeconds: 2400,
      remainingSeconds: 2400,
      amountMicros: 0,
      openedBy: 'Ana',
      restoredFrom: carlos.id,
      interruption: null,
    });
    expect(await pc2.next()).toEqual({
      type: 'state',
      status: 'active',
      vesRate: null,
      session: {
        kind: 'temporary',
        sessionId: restored.id,
        startedAt: '2026-09-28T22:50:00.000Z',
        name: 'Carlos',
        purchasedSeconds: 2400,
        remainingSeconds: 2400,
      },
    });

    // Ningún cobro nuevo: solo queda el de la apertura, y el ledger no se toca.
    const topups = await world.testApp.database.db.select().from(sessionTopups);
    expect(topups).toMatchObject([{ sessionId: carlos.id, seconds: 3600 }]);
    expect(await world.testApp.database.db.select().from(ledger)).toEqual([]);
    expect(await lastEvent()).toMatchObject({
      type: 'session.restored',
      actor: { kind: 'staff', name: 'Ana' },
      payload: {
        sessionId: restored.id,
        restoredFrom: carlos.id,
        pc: { id: devPcId(2), name: 'PC 02' },
        name: 'Carlos',
        seconds: 2400,
      },
    });

    // La original queda como restaurada y ya no sale en interrumpidas.
    expect(
      (await world.api('GET', '/sessions/temporary/interrupted', ana)).json<InterruptedSessions>()
        .sessions,
    ).toEqual([]);
    const backup = (
      await world.api('GET', '/sessions/temporary/backup', ana)
    ).json<TemporaryBackup>();
    expect(backup.sessions.find((s) => s.id === carlos.id)?.interruption).toMatchObject({
      status: 'restored',
      restoredBy: { name: 'Ana', at: '2026-09-28T22:50:00.000Z', sessionId: restored.id },
    });
  });

  it('también se puede restaurar en la misma PC', async () => {
    const carlos = await carlosCut();
    await world.pc(5);
    expect((await restore(carlos.id, 5)).statusCode).toBe(201);
  });

  it('CA-001-08: una sesión ya restaurada se rechaza y dice quién y cuándo', async () => {
    const carlos = await carlosCut();
    world.clock.advance(26 * MINUTE);
    await world.pc(2);
    await world.pc(3);
    expect((await restore(carlos.id, 2)).statusCode).toBe(201);
    world.clock.advance(MINUTE);

    const again = await restore(carlos.id, 3);

    expect(again.statusCode).toBe(409);
    expect(message(again)).toBe('Esta sesión ya fue restaurada por Ana a las 18:50');
    expect(
      await world.testApp.database.db
        .select()
        .from(sessions)
        .where(eq(sessions.restoredFrom, carlos.id)),
    ).toHaveLength(1);
  });

  it('CA-001-11: pasadas 48 h desde el corte está caducada, pero sigue en el respaldo', async () => {
    const carlos = await carlosCut();
    await world.pc(2);
    // El corte fue el lunes a las 18:20 (el último latido). Hasta el miércoles a las 18:20 se
    // puede; un minuto después, no.
    world.clock.advance(48 * HOUR - 4 * MINUTE + MINUTE);
    const late = await restore(carlos.id, 2);

    expect(late.statusCode).toBe(409);
    expect(message(late)).toBe('Esta sesión caducó: pasaron más de 48 horas desde el corte');
    const backup = (
      await world.api('GET', '/sessions/temporary/backup', ana)
    ).json<TemporaryBackup>();
    expect(backup.sessions.find((s) => s.id === carlos.id)?.interruption?.status).toBe('expired');
  });

  it('justo a las 48 h del corte todavía se puede', async () => {
    const carlos = await carlosCut();
    await world.pc(2);
    world.clock.advance(48 * HOUR - 4 * MINUTE);
    expect((await restore(carlos.id, 2)).statusCode).toBe(201);
  });

  it('REQ-001-68: una sesión restaurada que vuelve a interrumpirse se puede restaurar otra vez', async () => {
    const carlos = await carlosCut();
    const pc2 = await world.pc(2);
    const second = (await restore(carlos.id, 2)).json<TemporarySession>();
    await pc2.next();

    // En la PC 02 la usa 5 min y vuelve a irse la luz.
    await world.run(2, 5 * MINUTE, MINUTE);
    pc2.close();
    await pc2.closed;
    await world.clock.tick(4 * MINUTE);
    await world.pc(3);
    const third = await restore(second.id, 3);

    expect(third.statusCode).toBe(201);
    expect(third.json<TemporarySession>()).toMatchObject({
      restoredFrom: second.id,
      purchasedSeconds: 2100,
      remainingSeconds: 2100,
    });
  });

  it('REQ-001-69: solo se restauran las cerradas por un corte con tiempo restante', async () => {
    // Cerrada por el encargado, por el cliente y por agotamiento.
    const staffClosed = (await world.openTemporary(ana, 5, 10)).session;
    await world.api('POST', `/sessions/${staffClosed.id}/close`, ana);
    const client = await world.openTemporary(ana, 6, 10);
    await logout(client.pc);
    const exhausted = await world.openTemporary(ana, 7, 2);
    await world.run(7, 3 * MINUTE, MINUTE);
    // Cerrada sin latidos, pero ya sin tiempo restante.
    const noLeft = newId();
    await world.testApp.database.db.insert(sessions).values({
      id: noLeft,
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
    await world.pc(2);

    const notCut = 'Solo se restauran las sesiones interrumpidas por un corte';
    for (const id of [staffClosed.id, client.session.id, exhausted.session.id]) {
      const response = await restore(id, 2);
      expect(response.statusCode).toBe(409);
      expect(message(response)).toBe(notCut);
    }
    expect(message(await restore(noLeft, 2))).toBe('Esta sesión no tenía tiempo restante');
  });

  it('rechaza lo que no es una sesión temporal que se pueda restaurar', async () => {
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    const juanPc = await world.pc(6);
    await login(juanPc, 'juan');
    const [account] = await world.testApp.database.db
      .select()
      .from(sessions)
      .where(eq(sessions.pcId, devPcId(6)));
    const active = (await world.openTemporary(ana, 5, 30)).session;
    await world.pc(2);

    const unknown = await restore(newId(), 2);
    expect(unknown.statusCode).toBe(404);
    expect(message(unknown)).toBe('No existe esa sesión');
    expect(message(await restore(account?.id ?? '', 2))).toBe(
      'Solo se restauran las sesiones temporales',
    );
    expect(message(await restore(active.id, 2))).toBe('Esa sesión sigue en curso');
  });

  it('la PC de destino debe existir, estar libre y conectada', async () => {
    const carlos = await carlosCut();
    const busy = await world.openTemporary(ana, 2, 30, 'Otro');
    expect(busy.session.name).toBe('Otro');

    const onBusy = await restore(carlos.id, 2);
    expect(onBusy.statusCode).toBe(409);
    expect(message(onBusy)).toBe('La PC 02 ya tiene una sesión abierta');
    const offline = await restore(carlos.id, 3);
    expect(offline.statusCode).toBe(409);
    expect(message(offline)).toBe('La PC 03 no está conectada al nodo');
    const unknown = await world.api('POST', `/sessions/${carlos.id}/restore`, ana, {
      pcId: newId(),
    });
    expect(unknown.statusCode).toBe(404);
    expect(message(unknown)).toBe('No existe esa PC');
    // Ninguno de los intentos la consumió: sigue pendiente.
    await world.pc(3);
    expect((await restore(carlos.id, 3)).statusCode).toBe(201);
  });

  it('no pide turno abierto (no cobra), pero sí un rol de caja', async () => {
    const carlos = await carlosCut();
    await world.pc(2);
    const owner = await loginAsStaff(world.testApp, 'duena', 'dueno');
    const admin = await loginAsStaff(world.testApp, 'admin', 'administrador', 'Luis');

    expect((await restore(carlos.id, 2, null)).statusCode).toBe(401);
    expect((await restore(carlos.id, 2, owner)).statusCode).toBe(403);
    // El administrador no tiene turno abierto y restaura igual.
    const response = await restore(carlos.id, 2, admin);
    expect(response.statusCode).toBe(201);
    expect(response.json<TemporarySession>().openedBy).toBe('Luis');
  });
});
