import {
  type DomainEvent,
  type MaintenanceExit,
  newId,
  type PcCommandResponse,
  type PcControlSnapshot,
} from '@pope/shared';
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events, pcMaintenances } from '../db/schema.js';
import { devPcId } from '../pcs/dev-pcs.js';
import { loginAsStaff } from '../testing/auth.js';
import type { PcTestClient } from '../testing/pc-client.js';
import { PcWorld } from '../testing/pc-world.js';

// 18:00 en Caracas de un lunes.
const MONDAY = '2026-09-28T22:00:00Z';

describe('salida del mantenimiento desde la PC (e2e, REQ-003-41, REQ-003-44, CA-003-09, T39a)', () => {
  let world: PcWorld;
  let ana: string;

  beforeEach(async () => {
    world = await PcWorld.start(MONDAY);
    ana = await loginAsStaff(world.testApp, 'ana', 'encargado', 'Ana');
  });

  afterEach(async () => {
    await world.close();
  });

  const db = () => world.testApp.database.db;

  async function sync(pc: PcTestClient) {
    await pc.request({ type: 'listCombos', requestId: 'sync' });
  }

  const commandsPath = (n: number) => '/pcs/' + devPcId(n) + '/commands';

  async function snapshot(n: number) {
    return (await world.api('GET', `/pcs/${devPcId(n)}/control`, ana)).json<PcControlSnapshot>();
  }

  /** PC `n` en mantenimiento, abierto desde el panel por Ana y confirmado por la PC. */
  async function inMaintenance(n: number, existing?: PcTestClient) {
    const pc = existing ?? (await world.pc(n));
    const { context } = await snapshot(n);
    const response = await world.api('POST', `/pcs/${devPcId(n)}/commands`, ana, {
      id: newId(),
      kind: 'startMaintenance',
      expected: context,
    });
    const { command } = response.json<PcCommandResponse>();
    if (command.action.kind !== 'startMaintenance') throw new Error('Orden inesperada');
    const { maintenanceId } = command.action;
    await sync(pc);
    pc.send({
      type: 'commandAck',
      commandId: command.id,
      occurredAt: world.clock.now().toISOString(),
      result: {
        status: 'applied',
        effect: {
          kind: 'startMaintenance',
          maintenanceId,
          startedAt: world.clock.now().toISOString(),
        },
      },
    });
    await sync(pc);
    return { pc, maintenanceId };
  }

  const exitOf = (maintenanceId: string, over: Partial<MaintenanceExit> = {}): MaintenanceExit => ({
    id: newId(),
    maintenanceId,
    endedAt: world.clock.now().toISOString(),
    durationSeconds: 120,
    ...over,
  });

  async function eventsOf(type: DomainEvent['type']) {
    return (await db().select().from(events).orderBy(asc(events.seq))).filter(
      (e) => e.type === type,
    );
  }

  it('CA-003-09: la salida local se registra una vez con actor y duración, y se reconoce', async () => {
    const { pc, maintenanceId } = await inMaintenance(4);
    world.clock.advance(120_000);
    const exit = exitOf(maintenanceId);
    pc.send({ type: 'maintenanceExit', exit });
    expect(await pc.next()).toEqual({
      type: 'maintenanceExitAcknowledged',
      exitId: exit.id,
      maintenanceId,
    });
    await sync(pc);

    const [row] = await db().select().from(pcMaintenances);
    expect(row).toMatchObject({
      exitId: exit.id,
      durationSeconds: 120,
      exitSource: 'local',
      endedBy: { kind: 'staff', name: 'Ana' },
    });
    expect(await eventsOf('pc.maintenance_ended')).toMatchObject([
      {
        actor: { kind: 'staff', name: 'Ana' },
        payload: { maintenanceId, exitId: exit.id, source: 'local', durationSeconds: 120 },
      },
    ]);
    // Como tras cualquier cierre: bloqueo de sistema, y la PC vuelve a estar libre al aplicarlo.
    expect(pc.commands.at(-1)).toMatchObject({
      actor: { kind: 'system' },
      action: { kind: 'lock' },
    });
    await sync(pc);
    const state = await snapshot(4);
    expect(state.context.kind).toBe('free');
    expect(state.reservation).toBeNull();
  });

  it('REQ-003-44: repetida se reconoce sin registrar otra vez ni pedir otro bloqueo', async () => {
    const { pc, maintenanceId } = await inMaintenance(4);
    world.clock.advance(60_000);
    const exit = exitOf(maintenanceId, { durationSeconds: 60 });
    pc.send({ type: 'maintenanceExit', exit });
    await pc.next();
    await sync(pc);
    const locks = pc.commands.length;
    pc.send({ type: 'maintenanceExit', exit });
    expect(await pc.next()).toMatchObject({ type: 'maintenanceExitAcknowledged', exitId: exit.id });
    await sync(pc);
    expect(await eventsOf('pc.maintenance_ended')).toHaveLength(1);
    expect(pc.commands).toHaveLength(locks);
  });

  it('REQ-003-44: dos salidas iguales a la vez dejan un solo evento', async () => {
    const { pc, maintenanceId } = await inMaintenance(4);
    world.clock.advance(30_000);
    const exit = exitOf(maintenanceId, { durationSeconds: 30 });
    pc.send({ type: 'maintenanceExit', exit });
    pc.send({ type: 'maintenanceExit', exit });
    expect(await pc.next()).toMatchObject({ type: 'maintenanceExitAcknowledged' });
    expect(await pc.next()).toMatchObject({ type: 'maintenanceExitAcknowledged' });
    expect(await eventsOf('pc.maintenance_ended')).toHaveLength(1);
  });

  it('REQ-003-63: la salida de un mantenimiento ajeno o inexistente no se reconoce ni cambia nada', async () => {
    const { maintenanceId } = await inMaintenance(5);
    const other = await world.pc(4);
    other.send({ type: 'maintenanceExit', exit: exitOf(maintenanceId) });
    other.send({ type: 'maintenanceExit', exit: exitOf(newId()) });
    // Sin ACK: lo primero que recibe es la respuesta a esta petición.
    expect(await other.request({ type: 'listCombos', requestId: 'sync' })).toMatchObject({
      type: 'combos',
    });
    const [row] = await db().select().from(pcMaintenances);
    expect(row?.endedAt).toBeNull();
    expect(await eventsOf('pc.maintenance_ended')).toEqual([]);
  });

  it('REQ-003-44: la duración y la hora de fin no superan lo que el nodo vio', async () => {
    const { pc, maintenanceId } = await inMaintenance(4);
    world.clock.advance(120_000);
    const inflated = exitOf(maintenanceId, {
      durationSeconds: 99_999,
      endedAt: '2099-01-01T00:00:00.000Z',
    });
    pc.send({ type: 'maintenanceExit', exit: inflated });
    await pc.next();
    const [row] = await db().select().from(pcMaintenances);
    expect(row?.durationSeconds).toBe(120);
    expect(row?.endedAt?.toISOString()).toBe(world.clock.now().toISOString());
  });

  it('CA-003-09: una salida pendiente llega al reconectar y se registra una vez', async () => {
    const { pc, maintenanceId } = await inMaintenance(4);
    world.clock.advance(45_000);
    pc.close();
    const reconnected = await world.pc(4);
    // El nodo sigue viendo el mantenimiento abierto: no se pierde con la conexión.
    expect(reconnected.maintenance.at(-1)).toMatchObject({ maintenance: { id: maintenanceId } });
    const exit = exitOf(maintenanceId, { durationSeconds: 45 });
    reconnected.send({ type: 'maintenanceExit', exit });
    expect(await reconnected.next()).toMatchObject({ exitId: exit.id });
    expect(await eventsOf('pc.maintenance_ended')).toHaveLength(1);
  });

  /** Beto pide «Terminar» desde el panel; devuelve la orden que recibe la PC. */
  async function endFromPanel(pc: PcTestClient, n: number, cookie: string) {
    const { context } = await snapshot(n);
    const response = await world.api('POST', commandsPath(n), cookie, {
      id: newId(),
      kind: 'endMaintenance',
      expected: context,
    });
    expect(response.statusCode).toBe(200);
    await sync(pc);
    const command = pc.commands.at(-1);
    if (command?.action.kind !== 'endMaintenance') throw new Error('La PC no recibió la orden');
    return { command, action: command.action };
  }

  it('REQ-003-43: terminar desde el panel registra la salida con el actor del panel y libera la PC', async () => {
    const { pc, maintenanceId } = await inMaintenance(4);
    const beto = await loginAsStaff(world.testApp, 'beto', 'encargado', 'Beto');
    const { command, action } = await endFromPanel(pc, 4, beto);
    expect(action.maintenanceId).toBe(maintenanceId);
    expect((await snapshot(4)).reservation?.command.id).toBe(command.id);
    world.clock.advance(90_000);
    const exit = exitOf(maintenanceId, { id: action.exitId, durationSeconds: 90 });
    pc.send({
      type: 'commandAck',
      commandId: command.id,
      occurredAt: world.clock.now().toISOString(),
      result: { status: 'applied', effect: { kind: 'endMaintenance', exit } },
    });
    expect(await pc.next()).toEqual({
      type: 'maintenanceExitAcknowledged',
      exitId: exit.id,
      maintenanceId,
    });
    expect(await eventsOf('pc.maintenance_ended')).toMatchObject([
      {
        actor: { kind: 'staff', name: 'Beto' },
        payload: { maintenanceId, exitId: exit.id, source: 'panel', durationSeconds: 90 },
      },
    ]);
    await sync(pc);
    const state = await snapshot(4);
    expect(state.context.kind).toBe('free');
    expect(state.reservation).toBeNull();
    expect(pc.control?.context.kind).toBe('free');
  });

  it('CA-003-09: si el acuse se pierde y la orden vence, la salida que llega después sigue siendo del panel', async () => {
    const { pc, maintenanceId } = await inMaintenance(4);
    const beto = await loginAsStaff(world.testApp, 'beto', 'encargado', 'Beto');
    const { action } = await endFromPanel(pc, 4, beto);
    await world.clock.tick(31_000);
    expect((await snapshot(4)).reservation).toBeNull();
    const exit = exitOf(maintenanceId, { id: action.exitId, durationSeconds: 31 });
    pc.send({ type: 'maintenanceExit', exit });
    expect(await pc.next()).toMatchObject({ type: 'maintenanceExitAcknowledged', exitId: exit.id });
    expect(await eventsOf('pc.maintenance_ended')).toMatchObject([
      { actor: { kind: 'staff', name: 'Beto' }, payload: { source: 'panel' } },
    ]);
    // Es del panel, que ya tenía su orden: no se pide un bloqueo de sistema.
    expect(pc.commands.at(-1)?.action.kind).toBe('endMaintenance');
  });

  it('REQ-003-43: solo con un mantenimiento abierto; dueño y quien no tiene sesión, no', async () => {
    const free = await world.pc(4);
    const { context } = await snapshot(4);
    const stale = await world.api('POST', commandsPath(4), ana, {
      id: newId(),
      kind: 'endMaintenance',
      expected: { kind: 'maintenance', revision: context.revision, maintenanceId: newId() },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: 'stale_context' });
    const { maintenanceId } = await inMaintenance(5);
    const owner = await loginAsStaff(world.testApp, 'eva', 'dueno', 'Eva');
    const body = {
      id: newId(),
      kind: 'endMaintenance',
      expected: { ...(await snapshot(5)).context, maintenanceId },
    };
    expect((await world.api('POST', commandsPath(5), owner, body)).statusCode).toBe(403);
    expect((await world.api('POST', commandsPath(5), null, body)).statusCode).toBe(401);
    expect(free.commands).toEqual([]);
  });
});
