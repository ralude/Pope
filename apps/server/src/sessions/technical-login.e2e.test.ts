import { type DomainEvent, newId, type PcCommandResult, usd } from '@pope/shared';
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events, pcMaintenances } from '../db/schema.js';
import { loginAsStaff } from '../testing/auth.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import type { PcTestClient } from '../testing/pc-client.js';
import { createStaffService } from '../testing/staff.js';
import { activeSession, login, PcWorld } from '../testing/pc-world.js';

// 18:00 en Caracas de un lunes.
const MONDAY = '2026-09-28T22:00:00Z';

describe('login técnico desde la PC (e2e, REQ-003-40, T35c)', () => {
  let world: PcWorld;

  beforeEach(async () => {
    world = await PcWorld.start(MONDAY);
    await loginAsStaff(world.testApp, 'ana', 'encargado', 'Ana');
    await loginAsStaff(world.testApp, 'eva', 'dueno', 'Eva');
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
  });

  afterEach(async () => {
    await world.close();
  });

  const db = () => world.testApp.database.db;

  const technical = (username: string, password = 'secreto') => ({
    type: 'technicalLogin',
    requestId: newId(),
    username,
    password,
  });

  /** Espera a que la PC reciba la orden número `count`. */
  async function orderReceived(pc: PcTestClient, count: number) {
    for (let attempt = 0; attempt < 100 && pc.commands.length < count; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const command = pc.commands[count - 1];
    if (!command) throw new Error('La PC no recibió la orden de mantenimiento');
    return command;
  }

  async function sync(pc: PcTestClient) {
    await pc.request({ type: 'listCombos', requestId: 'sync' });
  }

  async function ack(pc: PcTestClient, commandId: string, result: PcCommandResult) {
    pc.send({ type: 'commandAck', commandId, occurredAt: world.clock.now().toISOString(), result });
    await sync(pc);
  }

  async function eventsOf(type: DomainEvent['type']) {
    return (await db().select().from(events).orderBy(asc(events.seq))).filter(
      (e) => e.type === type,
    );
  }

  it('REQ-003-40: con la PC libre el nodo envía la orden local y la entrada se registra al confirmarla la PC', async () => {
    const pc = await world.pc(4);
    const message = technical('ana');
    pc.send(message);
    const command = await orderReceived(pc, 1);
    expect(command).toMatchObject({
      actor: { kind: 'staff', name: 'Ana' },
      action: { kind: 'startMaintenance', source: 'local' },
      expected: { kind: 'free' },
    });
    // Aún no hay mantenimiento: el nodo espera el acuse de la PC.
    expect(await db().select().from(pcMaintenances)).toEqual([]);
    if (command.action.kind !== 'startMaintenance') throw new Error('Orden inesperada');
    const { maintenanceId } = command.action;
    await ack(pc, command.id, {
      status: 'applied',
      effect: { kind: 'startMaintenance', maintenanceId, startedAt: '2020-01-01T00:00:00.000Z' },
    });
    expect(pc.maintenance.at(-1)).toMatchObject({
      requestId: message.requestId,
      maintenance: { id: maintenanceId, source: 'local', actor: { name: 'Ana' } },
    });
    expect(await eventsOf('pc.maintenance_started')).toMatchObject([
      { actor: { kind: 'staff', name: 'Ana' }, payload: { maintenanceId, source: 'local' } },
    ]);
  });

  it('REQ-003-40: si la PC no puede abrir Windows, el Shell recibe el error con su petición', async () => {
    const pc = await world.pc(4);
    const message = technical('ana');
    pc.send(message);
    const command = await orderReceived(pc, 1);
    pc.send({
      type: 'commandAck',
      commandId: command.id,
      occurredAt: world.clock.now().toISOString(),
      result: {
        status: 'failed',
        kind: 'startMaintenance',
        code: 'invalid_action',
        message: 'Aún no disponible',
      },
    });
    expect(await pc.next()).toMatchObject({
      type: 'technicalError',
      requestId: message.requestId,
      code: 'maintenance_unavailable',
    });
    expect(await db().select().from(pcMaintenances)).toEqual([]);
    expect(await eventsOf('pc.maintenance_started')).toEqual([]);
  });

  it('REQ-003-40: dueño, desactivado y contraseña errónea reciben su error, sin orden', async () => {
    const staff = createStaffService(world.testApp.database);
    const baja = await staff.create(
      { username: 'baja', displayName: 'Baja', role: 'encargado', password: 'secreto' },
      { kind: 'system' },
    );
    await staff.setActive(baja.id, false, { kind: 'system' });
    const pc = await world.pc(4);
    for (const [username, password, code] of [
      ['eva', 'secreto', 'forbidden'],
      ['baja', 'secreto', 'staff_inactive'],
      ['ana', 'mal', 'invalid_credentials'],
      ['nadie', 'secreto', 'invalid_credentials'],
    ] as const) {
      const message = technical(username, password);
      expect(await pc.request(message)).toMatchObject({
        type: 'technicalError',
        requestId: message.requestId,
        code,
      });
    }
    expect(pc.commands).toEqual([]);
  });

  it('REQ-003-40: con sesión activa o en pausa responde pc_unavailable antes de mirar la contraseña', async () => {
    const pc = await world.pc(4);
    activeSession(await login(pc, 'juan'));
    // Con la contraseña mal: si se hubiera verificado, el error sería otro.
    expect(await pc.request(technical('ana', 'mal'))).toMatchObject({
      type: 'technicalError',
      code: 'pc_unavailable',
      message: 'Cierra antes la sesión del cliente',
    });
    await pc.request({ type: 'pause', requestId: 'pause-1' });
    expect(await pc.request(technical('ana'))).toMatchObject({
      code: 'pc_unavailable',
      message: 'Cierra antes la sesión del cliente',
    });
    expect(pc.commands).toEqual([]);
  });

  it('REQ-003-40: dos intentos seguidos abren una sola orden y un login de cliente espera', async () => {
    const pc = await world.pc(4);
    pc.send(technical('ana'));
    const second = technical('ana');
    pc.send(second);
    expect(await pc.next()).toMatchObject({
      type: 'technicalError',
      requestId: second.requestId,
      code: 'pc_unavailable',
      message: 'La PC tiene una orden del encargado en curso',
    });
    expect(pc.commands).toHaveLength(1);
    expect(await login(pc, 'juan')).toMatchObject({ type: 'error', code: 'pc_unavailable' });
  });

  it('REQ-003-40: con un mantenimiento abierto responde que ya está en mantenimiento', async () => {
    const pc = await world.pc(4);
    pc.send(technical('ana'));
    const command = await orderReceived(pc, 1);
    if (command.action.kind !== 'startMaintenance') throw new Error('Orden inesperada');
    await ack(pc, command.id, {
      status: 'applied',
      effect: {
        kind: 'startMaintenance',
        maintenanceId: command.action.maintenanceId,
        startedAt: '2020-01-01T00:00:00.000Z',
      },
    });
    expect(await pc.request(technical('ana'))).toMatchObject({
      type: 'technicalError',
      code: 'pc_unavailable',
      message: 'La PC ya está en mantenimiento',
    });
  });
});
