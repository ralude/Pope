import {
  type DomainEvent,
  newId,
  type PcCommandResponse,
  type PcCommandResult,
  type PcControlSnapshot,
  usd,
} from '@pope/shared';
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events, pcMaintenances } from '../db/schema.js';
import { devPcId } from '../pcs/dev-pcs.js';
import { loginAsStaff } from '../testing/auth.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import type { PcTestClient } from '../testing/pc-client.js';
import { activeSession, login, PcWorld } from '../testing/pc-world.js';

// 18:00 en Caracas de un lunes.
const MONDAY = '2026-09-28T22:00:00Z';

describe('mantenimiento desde el panel (e2e, REQ-003-43, CA-003-07, T35b)', () => {
  let world: PcWorld;
  let ana: string;

  beforeEach(async () => {
    world = await PcWorld.start(MONDAY);
    ana = await loginAsStaff(world.testApp, 'ana', 'encargado', 'Ana');
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
  });

  afterEach(async () => {
    await world.close();
  });

  const db = () => world.testApp.database.db;

  async function snapshot(n: number, cookie = ana) {
    return (await world.api('GET', `/pcs/${devPcId(n)}/control`, cookie)).json<PcControlSnapshot>();
  }

  async function sync(pc: PcTestClient) {
    await pc.request({ type: 'listCombos', requestId: 'sync' });
  }

  async function ack(pc: PcTestClient, commandId: string, result: PcCommandResult) {
    pc.send({ type: 'commandAck', commandId, occurredAt: world.clock.now().toISOString(), result });
    await sync(pc);
  }

  /** Pide «Iniciar como administrador» con el contexto vigente. */
  async function start(n: number, cookie: string | null = ana, expected?: object) {
    const context = expected ?? (await snapshot(n)).context;
    return world.api('POST', `/pcs/${devPcId(n)}/commands`, cookie, {
      id: newId(),
      kind: 'startMaintenance',
      expected: context,
    });
  }

  async function eventsOf(type: DomainEvent['type']) {
    return (await db().select().from(events).orderBy(asc(events.seq))).filter(
      (e) => e.type === type,
    );
  }

  /** PC libre a la que ya llegó una orden de mantenimiento. */
  async function requested(n = 4) {
    const pc = await world.pc(n);
    const response = await start(n);
    expect(response.statusCode).toBe(200);
    const command = response.json<PcCommandResponse>().command;
    await sync(pc);
    return { pc, command };
  }

  /** ID de mantenimiento de la orden. */
  function maintenanceIdOf(command: PcCommandResponse['command']): string {
    if (command.action.kind !== 'startMaintenance') throw new Error('Orden inesperada');
    return command.action.maintenanceId;
  }

  const accepted = { status: 'accepted', kind: 'startMaintenance' } as const;
  const appliedOf = (maintenanceId: string) =>
    ({
      status: 'applied',
      effect: { kind: 'startMaintenance', maintenanceId, startedAt: '2020-01-01T00:00:00.000Z' },
    }) as const;

  it('CA-003-07: la orden del panel llega a la PC libre con su ID de mantenimiento y la reserva', async () => {
    const { pc, command } = await requested();
    expect(pc.commands.at(-1)).toEqual(command);
    expect(command).toMatchObject({
      actor: { kind: 'staff', name: 'Ana' },
      action: { kind: 'startMaintenance', source: 'panel' },
    });
    expect((await snapshot(4)).reservation?.command.id).toBe(command.id);
    // Aún no hay mantenimiento: pedirlo no demuestra que Windows lo haya abierto.
    expect(await db().select().from(pcMaintenances)).toEqual([]);
    expect(await eventsOf('pc.maintenance_started')).toEqual([]);
  });

  it('REQ-003-41: al confirmarlo la PC se registra con la hora del nodo, el actor del panel y su contexto', async () => {
    const { pc, command } = await requested();
    const maintenanceId = maintenanceIdOf(command);
    await ack(pc, command.id, accepted);
    expect(await db().select().from(pcMaintenances)).toEqual([]);
    await ack(pc, command.id, appliedOf(maintenanceId));

    const [row] = await db().select().from(pcMaintenances);
    expect(row).toMatchObject({
      id: maintenanceId,
      pcName: 'PC 04',
      source: 'panel',
      actor: { kind: 'staff', name: 'Ana' },
      endedAt: null,
    });
    // La hora es la del nodo, no la que informó la PC.
    expect(row?.startedAt.toISOString()).toBe(world.clock.now().toISOString());
    expect(await eventsOf('pc.maintenance_started')).toMatchObject([
      {
        actor: { kind: 'staff', name: 'Ana' },
        payload: { maintenanceId, source: 'panel', pc: { name: 'PC 04' } },
      },
    ]);
    expect(pc.maintenance.at(-1)).toMatchObject({
      maintenance: { id: maintenanceId, source: 'panel', actor: { name: 'Ana' } },
    });
    const state = await snapshot(4);
    expect(state.context).toMatchObject({ kind: 'maintenance', maintenanceId });
    // La reserva se liberó al confirmarse el efecto.
    expect(state.reservation).toBeNull();
    expect(pc.control?.context).toMatchObject({ kind: 'maintenance', maintenanceId });
  });

  it('REQ-003-43: en mantenimiento no admite clientes ni mensajes', async () => {
    const { pc, command } = await requested();
    await ack(pc, command.id, appliedOf(maintenanceIdOf(command)));
    expect(await login(pc, 'juan')).toMatchObject({ type: 'error', code: 'pc_unavailable' });
    const { context } = await snapshot(4);
    const message = await world.api('POST', `/pcs/${devPcId(4)}/commands`, ana, {
      id: newId(),
      kind: 'showMessage',
      expected: context,
      text: 'Hola',
    });
    expect(message.statusCode).toBe(400);
    expect(message.json()).toMatchObject({ code: 'invalid_command' });
  });

  it('REQ-003-43: si la PC no puede abrirlo, no se registra nada y la PC queda libre', async () => {
    const { pc, command } = await requested();
    await ack(pc, command.id, {
      status: 'failed',
      kind: 'startMaintenance',
      code: 'invalid_action',
      message: 'Aún no disponible',
    });
    expect(await db().select().from(pcMaintenances)).toEqual([]);
    expect(await eventsOf('pc.maintenance_started')).toEqual([]);
    expect((await snapshot(4)).reservation).toBeNull();
    expect(await login(pc, 'juan')).toMatchObject({ type: 'state', status: 'active' });
  });

  it('REQ-003-43: una orden que vence sin respuesta libera la PC y no registra nada', async () => {
    const { pc } = await requested();
    await world.clock.tick(31_000);
    expect(await db().select().from(pcMaintenances)).toEqual([]);
    expect((await snapshot(4)).reservation).toBeNull();
    expect(await login(pc, 'juan')).toMatchObject({ type: 'state', status: 'active' });
  });

  it('REQ-003-43: con una sesión abierta el contexto ya no es libre', async () => {
    const pc = await world.pc(4);
    const stale = (await snapshot(4)).context;
    activeSession(await login(pc, 'juan'));
    const response = await start(4, ana, stale);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'stale_context' });
    // Con el contexto de la sesión, el contrato no admite abrir un mantenimiento.
    const session = await start(4);
    expect(session.statusCode).toBe(400);
    expect(session.json()).toMatchObject({ code: 'invalid_command' });
    expect(await db().select().from(pcMaintenances)).toEqual([]);
  });

  it('REQ-003-20: el dueño y quien no tiene sesión no pueden iniciarlo', async () => {
    await world.pc(4);
    const owner = await loginAsStaff(world.testApp, 'eva', 'dueno', 'Eva');
    expect((await start(4, owner)).statusCode).toBe(403);
    expect((await start(4, null)).statusCode).toBe(401);
    expect((await start(4)).statusCode).toBe(200);
  });

  it('REQ-003-44: al conectar la PC recibe su mantenimiento, o null si no lo hay', async () => {
    const free = await world.pc(4);
    expect(free.maintenance).toMatchObject([{ maintenance: null }]);
    const { pc, command } = await requested(5);
    const maintenanceId = maintenanceIdOf(command);
    await ack(pc, command.id, appliedOf(maintenanceId));
    const again = await world.pc(5);
    expect(again.maintenance).toMatchObject([
      { maintenance: { id: maintenanceId, source: 'panel' } },
    ]);
  });
});
