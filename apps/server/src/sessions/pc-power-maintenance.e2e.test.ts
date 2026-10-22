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

describe('reiniciar o apagar con un mantenimiento (e2e, REQ-003-20, T30b/T39c)', () => {
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
  const commandsPath = (n: number) => '/pcs/' + devPcId(n) + '/commands';

  async function sync(pc: PcTestClient) {
    await pc.request({ type: 'listCombos', requestId: 'sync' });
  }

  async function snapshot(n: number) {
    return (await world.api('GET', `/pcs/${devPcId(n)}/control`, ana)).json<PcControlSnapshot>();
  }

  async function eventsOf(type: DomainEvent['type']) {
    return (await db().select().from(events).orderBy(asc(events.seq))).filter(
      (e) => e.type === type,
    );
  }

  /** PC 4 en mantenimiento, abierto por Ana desde el panel y confirmado por la PC. */
  async function inMaintenance() {
    const pc = await world.pc(4);
    pc.autoLock = false;
    const { context } = await snapshot(4);
    const response = await world.api('POST', commandsPath(4), ana, {
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

  /** Beto pide reiniciar o apagar con el mantenimiento abierto. */
  async function ask(kind: 'restart' | 'powerOff', cookie: string, extra: object = {}) {
    const { context } = await snapshot(4);
    const id = newId();
    const body = { id, kind, expected: context, confirmed: true, ...extra };
    return { id, body, response: await world.api('POST', commandsPath(4), cookie, body) };
  }

  it.each(['restart', 'powerOff'] as const)(
    'REQ-003-20: %s primero termina el mantenimiento y después ejecuta la orden',
    async (kind) => {
      const { pc, maintenanceId } = await inMaintenance();
      const beto = await loginAsStaff(world.testApp, 'beto', 'encargado', 'Beto');
      const { response } = await ask(kind, beto);
      expect(response.statusCode).toBe(200);
      const first = response.json<PcCommandResponse>().command;
      expect(first.action).toMatchObject({ kind: 'endMaintenance', maintenanceId });
      await sync(pc);
      expect(pc.commands.at(-1)).toEqual(first);
      // Todavía no se ha pedido la energía: antes hay que registrar la salida.
      expect(pc.commands.filter((command) => command.action.kind === kind)).toEqual([]);

      world.clock.advance(60_000);
      const exit: MaintenanceExit = {
        id: first.action.kind === 'endMaintenance' ? first.action.exitId : newId(),
        maintenanceId,
        endedAt: world.clock.now().toISOString(),
        durationSeconds: 60,
      };
      pc.send({
        type: 'commandAck',
        commandId: first.id,
        occurredAt: world.clock.now().toISOString(),
        result: { status: 'applied', effect: { kind: 'endMaintenance', exit } },
      });
      await sync(pc);

      expect(await eventsOf('pc.maintenance_ended')).toMatchObject([
        {
          actor: { kind: 'staff', name: 'Beto' },
          payload: { maintenanceId, exitId: exit.id, source: 'panel', durationSeconds: 60 },
        },
      ]);
      const energy = pc.commands.at(-1);
      expect(energy).toMatchObject({
        actor: { kind: 'staff', name: 'Beto' },
        action: { kind },
        expected: { kind: 'free' },
      });
      expect((await snapshot(4)).reservation?.command.id).toBe(energy?.id);
      const requested = await eventsOf('pc.command_requested');
      expect(requested.map((event) => (event.payload as { kind: string }).kind)).toEqual([
        'startMaintenance',
        'endMaintenance',
        kind,
      ]);
    },
  );

  it('REQ-003-20: si la salida falla no se reinicia nada y el mantenimiento sigue abierto', async () => {
    const { pc } = await inMaintenance();
    const { response } = await ask('restart', ana);
    const first = response.json<PcCommandResponse>().command;
    await sync(pc);
    pc.send({
      type: 'commandAck',
      commandId: first.id,
      occurredAt: world.clock.now().toISOString(),
      result: {
        status: 'failed',
        kind: 'endMaintenance',
        code: 'native_failure',
        message: 'No se pudo cerrar Windows',
      },
    });
    await sync(pc);
    expect(pc.commands.filter((command) => command.action.kind === 'restart')).toEqual([]);
    const [row] = await db().select().from(pcMaintenances);
    expect(row?.endedAt).toBeNull();
    expect(await eventsOf('pc.maintenance_ended')).toEqual([]);
  });

  it('REQ-003-20: si la orden de salida vence, tampoco se reinicia', async () => {
    const { pc } = await inMaintenance();
    await ask('powerOff', ana);
    await world.clock.tick(31_000);
    await sync(pc);
    expect(pc.commands.filter((command) => command.action.kind === 'powerOff')).toEqual([]);
    expect((await snapshot(4)).reservation).toBeNull();
  });

  it('REQ-003-20: repetir la petición con el mismo ID devuelve la misma orden', async () => {
    const { pc } = await inMaintenance();
    const { body, response } = await ask('restart', ana);
    const again = await world.api('POST', commandsPath(4), ana, body);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual(response.json());
    await sync(pc);
    expect(pc.commands.filter((command) => command.action.kind === 'endMaintenance')).toHaveLength(
      1,
    );
  });

  it('REQ-003-20: sin confirmar pide confirmación; dueño y sin sesión, no', async () => {
    await inMaintenance();
    const { context } = await snapshot(4);
    const unconfirmed = await world.api('POST', commandsPath(4), ana, {
      id: newId(),
      kind: 'restart',
      expected: context,
    });
    expect(unconfirmed.statusCode).toBe(400);
    expect(unconfirmed.json()).toMatchObject({ code: 'confirmation_required' });
    const owner = await loginAsStaff(world.testApp, 'eva', 'dueno', 'Eva');
    expect((await ask('restart', owner)).response.statusCode).toBe(403);
    expect((await world.api('POST', commandsPath(4), null, {})).statusCode).toBe(401);
    expect((await snapshot(4)).reservation).toBeNull();
  });
});
