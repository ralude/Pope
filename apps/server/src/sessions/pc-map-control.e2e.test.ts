import {
  newId,
  type PcCommandResponse,
  type PcControlSnapshot,
  type PcMap,
  type PcMapItem,
} from '@pope/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { pcs } from '../db/schema.js';

import { devPcId } from '../pcs/dev-pcs.js';
import { loginAsStaff } from '../testing/auth.js';
import type { PcTestClient } from '../testing/pc-client.js';
import { PcWorld } from '../testing/pc-world.js';

// 18:00 en Caracas de un lunes.
const MONDAY = '2026-09-28T22:00:00Z';

describe('mapa: mantenimiento, encendido y órdenes en curso (e2e, T41a)', () => {
  let world: PcWorld;
  let ana: string;

  beforeEach(async () => {
    world = await PcWorld.start(MONDAY);
    ana = await loginAsStaff(world.testApp, 'ana', 'encargado', 'Ana');
  });

  afterEach(async () => {
    await world.close();
  });

  const commandsPath = (n: number) => '/pcs/' + devPcId(n) + '/commands';

  async function item(n: number): Promise<PcMapItem> {
    const map = (await world.api('GET', '/pcs/map', ana)).json<PcMap>();
    const found = map.pcs.find((pc) => pc.id === devPcId(n));
    if (!found) throw new Error('La PC no está en el mapa');
    return found;
  }

  async function snapshot(n: number) {
    return (await world.api('GET', `/pcs/${devPcId(n)}/control`, ana)).json<PcControlSnapshot>();
  }

  async function sync(pc: PcTestClient) {
    await pc.request({ type: 'listCombos', requestId: 'sync' });
  }

  async function ask(n: number, kind: 'startMaintenance' | 'restart') {
    const { context } = await snapshot(n);
    const response = await world.api('POST', commandsPath(n), ana, {
      id: newId(),
      kind,
      expected: context,
    });
    expect(response.statusCode).toBe(200);
    return response.json<PcCommandResponse>();
  }

  it('REQ-003-22: canWake dice si la PC tiene la MAC registrada', async () => {
    const db = world.testApp.database.db;
    expect((await item(4)).canWake).toBe(true);
    await db
      .update(pcs)
      .set({ macAddress: null })
      .where(eq(pcs.id, devPcId(4)));
    expect((await item(4)).canWake).toBe(false);
    expect((await item(5)).canWake).toBe(true);
  });

  it('REQ-003-20: la orden que reserva la PC aparece mientras puede producir su efecto', async () => {
    const pc = await world.pc(4);
    pc.autoLock = false;
    expect((await item(4)).order).toBeNull();
    const { command } = await ask(4, 'restart');
    expect((await item(4)).order).toEqual({
      id: command.id,
      kind: 'restart',
      status: 'requested',
    });
    await sync(pc);
    pc.send({
      type: 'commandAck',
      commandId: command.id,
      occurredAt: world.clock.now().toISOString(),
      result: { status: 'accepted', kind: 'restart' },
    });
    await sync(pc);
    expect((await item(4)).order).toMatchObject({ id: command.id, status: 'accepted' });
  });

  it('REQ-003-20: una orden vencida o con efecto confirmado ya no figura en el mapa', async () => {
    const pc = await world.pc(4);
    pc.autoLock = false;
    await ask(4, 'restart');
    await world.clock.tick(31_000);
    expect((await item(4)).order).toBeNull();

    const other = await world.pc(5);
    const { command } = await ask(5, 'startMaintenance');
    await sync(other);
    other.send({
      type: 'commandAck',
      commandId: command.id,
      occurredAt: world.clock.now().toISOString(),
      result: {
        status: 'applied',
        effect: {
          kind: 'startMaintenance',
          maintenanceId:
            command.action.kind === 'startMaintenance' ? command.action.maintenanceId : newId(),
          startedAt: world.clock.now().toISOString(),
        },
      },
    });
    await sync(other);
    expect((await item(5)).order).toBeNull();
  });

  it('REQ-003-21, REQ-003-43: el mapa muestra el mantenimiento con quién lo abrió y desde dónde', async () => {
    const pc = await world.pc(4);
    expect((await item(4)).maintenance).toBeNull();
    const { command } = await ask(4, 'startMaintenance');
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
    expect((await item(4)).maintenance).toEqual({
      id: maintenanceId,
      actorName: 'Ana',
      source: 'panel',
      startedAt: world.clock.now().toISOString(),
    });
    expect((await item(5)).maintenance).toBeNull();
  });

  it('REQ-003-20: el panel consulta una orden de la PC, también el dueño; la de otra PC no', async () => {
    const pc = await world.pc(4);
    await world.pc(5);
    pc.autoLock = false;
    const { command } = await ask(4, 'restart');
    const read = await world.api('GET', commandsPath(4) + '/' + command.id, ana);
    expect(read.statusCode).toBe(200);
    expect(read.headers['cache-control']).toBe('no-store');
    expect(read.json<PcCommandResponse>()).toMatchObject({
      command: { id: command.id, action: { kind: 'restart' } },
      status: 'requested',
      lastResult: null,
    });
    const owner = await loginAsStaff(world.testApp, 'eva', 'dueno', 'Eva');
    expect((await world.api('GET', commandsPath(4) + '/' + command.id, owner)).statusCode).toBe(
      200,
    );
    const elsewhere = await world.api('GET', commandsPath(5) + '/' + command.id, ana);
    expect(elsewhere.statusCode).toBe(404);
    expect(elsewhere.json()).toMatchObject({ code: 'unknown_pc' });
    expect((await world.api('GET', commandsPath(4) + '/' + newId(), ana)).statusCode).toBe(404);
    expect((await world.api('GET', commandsPath(4) + '/' + command.id, null)).statusCode).toBe(401);
  });
});
