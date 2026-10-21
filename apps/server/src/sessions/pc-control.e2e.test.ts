import { newId, usd } from '@pope/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { pcCommands, pcControlStates, pcMaintenances } from '../db/schema.js';
import { devPcId } from '../pcs/dev-pcs.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import type { PcTestClient } from '../testing/pc-client.js';
import { activeSession, login, PcWorld } from '../testing/pc-world.js';
import { PcControlService } from './pc-control.service.js';
import { PC_UNAVAILABLE_FOR_CUSTOMER } from './sessions.service.js';

const MINUTE = 60_000;
// 18:00 en Caracas de un lunes: 1,50 USD/h.
const MONDAY = '2026-09-28T22:00:00Z';

describe('contexto de control de las PCs (e2e, spec 003, T28)', () => {
  let world: PcWorld;

  beforeEach(async () => {
    world = await PcWorld.start(MONDAY);
  });

  afterEach(async () => {
    await world.close();
  });

  const db = () => world.testApp.database.db;
  const control = () => world.testApp.app.get(PcControlService);

  /**
   * Latido v2 con la copia del contexto que tiene la PC; devuelve su `state`. El nodo procesa
   * los mensajes de cada PC en orden, así que tras la respuesta a `listCombos` ya llegó el
   * `controlState` que el latido hubiera provocado.
   */
  async function beat(pc: PcTestClient, sessionId: string | null) {
    const state = await pc.request({
      type: 'heartbeat',
      sessionId,
      localRemainingSeconds: null,
      controlContext: pc.control?.context ?? null,
    });
    await pc.request({ type: 'listCombos', requestId: 'sync' });
    return state;
  }

  /** Reserva la PC como lo hará una orden en curso. */
  async function reserve(n: number) {
    const actor = { kind: 'staff' as const, staffId: newId(), name: 'Ana' };
    const commandId = newId();
    const expected = await control().current(devPcId(n));
    if (!expected) throw new Error(`No existe la PC ${String(n)}`);
    await db()
      .insert(pcCommands)
      .values({
        id: commandId,
        pcId: devPcId(n),
        actor,
        request: { id: commandId, kind: 'lock', expected: { kind: 'free', revision: newId() } },
        expected,
        action: { kind: 'lock' },
        issuedAt: world.clock.now(),
        expiresAt: new Date(world.clock.now().getTime() + 30_000),
      });
    await db()
      .update(pcControlStates)
      .set({ reservedCommandId: commandId, reservedAt: world.clock.now() })
      .where(eq(pcControlStates.pcId, devPcId(n)));
  }

  it('REQ-003-20: tras hello la PC recibe su contexto libre con revisión y la hora del nodo', async () => {
    const pc = await world.pc(4);
    await beat(pc, null);
    expect(pc.control).toMatchObject({
      type: 'controlState',
      context: { kind: 'free' },
      serverTime: world.clock.now().toISOString(),
    });
    expect(pc.control?.context).toEqual(await control().current(devPcId(4)));
    const received = pc.controls;
    // Mismo contexto: el nodo no lo reenvía ni cambia la revisión.
    world.clock.advance(MINUTE);
    await beat(pc, null);
    await beat(pc, null);
    expect(pc.controls).toBe(received);
    expect(await control().current(devPcId(4))).toEqual(pc.control?.context);
  });

  it('REQ-003-20: una copia ajena o vieja del contexto se corrige en el siguiente latido', async () => {
    const pc = await world.pc(4);
    await beat(pc, null);
    const current = pc.control?.context;
    await pc.request({
      type: 'heartbeat',
      sessionId: null,
      localRemainingSeconds: null,
      controlContext: { kind: 'free', revision: newId() },
    });
    await pc.request({ type: 'listCombos', requestId: 'sync' });
    expect(pc.control?.context).toEqual(current);
  });

  it('REQ-003-20: la revisión cambia al ocupar y pausar, no al descontar segundos', async () => {
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    const pc = await world.pc(4);
    await beat(pc, null);
    const free = pc.control?.context;

    const sessionId = activeSession(await login(pc, 'juan')).sessionId;
    await beat(pc, sessionId);
    const used = pc.control?.context;
    expect(used).toMatchObject({ kind: 'session', sessionId });
    expect(used?.revision).not.toBe(free?.revision);

    world.clock.advance(MINUTE);
    await beat(pc, sessionId);
    expect(pc.control?.context).toEqual(used);

    await pc.request({ type: 'pause', requestId: 'pause-1' });
    await beat(pc, sessionId);
    const paused = pc.control?.context;
    expect(paused).toMatchObject({ kind: 'session', sessionId });
    expect(paused?.revision).not.toBe(used?.revision);

    expect(await pc.request({ type: 'logout', requestId: 'logout-1' })).toMatchObject({
      type: 'sessionEnded',
    });
    await beat(pc, null);
    expect(pc.control?.context.kind).toBe('free');
    expect(pc.control?.context.revision).not.toBe(free?.revision);
  });

  it('REQ-003-43: un mantenimiento abierto es el contexto de la PC', async () => {
    const pc = await world.pc(4);
    const maintenanceId = newId();
    await db()
      .insert(pcMaintenances)
      .values({
        id: maintenanceId,
        pcId: devPcId(4),
        pcName: 'PC 04',
        actor: { kind: 'staff', staffId: newId(), name: 'Luis' },
        source: 'panel',
        startedAt: world.clock.now(),
      });
    await beat(pc, null);
    expect(pc.control?.context).toMatchObject({ kind: 'maintenance', maintenanceId });
  });

  it('REQ-003-20: con una orden en curso, el login del cliente se rechaza sin contar el intento', async () => {
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    const pc = await world.pc(4);
    await reserve(4);
    expect(await login(pc, 'juan', 'mal')).toEqual({
      type: 'error',
      code: 'pc_unavailable',
      message: PC_UNAVAILABLE_FOR_CUSTOMER,
      requestId: 'login-1',
    });
    // La reserva no afecta a las demás PCs.
    activeSession(await login(await world.pc(5), 'juan'));
  });

  it('REQ-003-43: en mantenimiento no se abre una sesión con cuenta ni temporal', async () => {
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    const cookie = await world.cashier();
    const pc = await world.pc(4);
    await db()
      .insert(pcMaintenances)
      .values({
        id: newId(),
        pcId: devPcId(4),
        pcName: 'PC 04',
        actor: { kind: 'staff', staffId: newId(), name: 'Luis' },
        source: 'panel',
        startedAt: world.clock.now(),
      });
    expect(await login(pc, 'juan')).toMatchObject({ type: 'error', code: 'pc_unavailable' });
    const response = await world.api('POST', '/sessions/temporary', cookie, {
      pcId: devPcId(4),
      paymentMethod: 'cash_usd',
      minutes: 30,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json<{ message: string }>().message).toBe('La PC 04 está en mantenimiento');
  });

  it('REQ-003-20: con una orden en curso no se abre ni se restaura una temporal', async () => {
    const cookie = await world.cashier();
    // Una temporal en la PC 05 se corta con 40 min restantes.
    const { pc: cut, session } = await world.openTemporary(cookie, 5, 60, 'Carlos');
    await world.run(5, 20 * MINUTE, MINUTE);
    cut.close();
    await cut.closed;
    await world.clock.tick(4 * MINUTE);

    await world.pc(4);
    await reserve(4);
    const open = await world.api('POST', '/sessions/temporary', cookie, {
      pcId: devPcId(4),
      paymentMethod: 'cash_usd',
      minutes: 30,
    });
    expect(open.statusCode).toBe(409);
    expect(open.json<{ message: string }>().message).toBe(
      'La PC 04 tiene una orden del encargado en curso',
    );
    const restore = await world.api('POST', `/sessions/${session.id}/restore`, cookie, {
      pcId: devPcId(4),
    });
    expect(restore.statusCode).toBe(409);
    expect(restore.json<{ message: string }>().message).toBe(
      'La PC 04 tiene una orden del encargado en curso',
    );
  });
});
