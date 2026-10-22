import { type DomainEvent, newId, type PcCommandResult, usd } from '@pope/shared';
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events, pcMaintenances } from '../db/schema.js';
import { devPcId } from '../pcs/dev-pcs.js';
import { loginAsStaff } from '../testing/auth.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { PanelClient } from '../testing/panel-client.js';
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
  it('REQ-003-45, CA-003-10: diez fallos desde dos PCs bloquean la cuenta y un acierto posterior espera 60 s', async () => {
    const pc4 = await world.pc(4);
    const pc5 = await world.pc(5);
    for (let i = 0; i < 9; i++) {
      const pc = i % 2 === 0 ? pc4 : pc5;
      expect(await pc.request(technical('ana', 'mal'))).toMatchObject({
        code: 'invalid_credentials',
      });
    }
    const tenth = technical('ana', 'mal');
    const locked = await pc5.request(tenth);
    expect(locked).toMatchObject({
      type: 'technicalError',
      requestId: tenth.requestId,
      code: 'technical_login_locked',
      lockedUntil: new Date(world.clock.now().getTime() + 60_000).toISOString(),
    });
    expect(await eventsOf('staff.technical_login_locked')).toHaveLength(1);

    // Con la contraseña buena, desde otra PC, sigue bloqueada y no se envía ninguna orden.
    expect(await pc4.request(technical('ana'))).toMatchObject({ code: 'technical_login_locked' });
    expect(pc4.commands).toEqual([]);

    world.clock.advance(60_000);
    pc4.send(technical('ana'));
    expect(await orderReceived(pc4, 1)).toMatchObject({
      action: { kind: 'startMaintenance', source: 'local' },
    });
  });

  it('REQ-003-45: los intentos en una PC ocupada no cuentan como fallos', async () => {
    const pc = await world.pc(4);
    activeSession(await login(pc, 'juan'));
    for (let i = 0; i < 12; i++) {
      expect(await pc.request(technical('ana', 'mal'))).toMatchObject({ code: 'pc_unavailable' });
    }
    expect(await eventsOf('staff.technical_login_locked')).toEqual([]);
    const free = await world.pc(5);
    expect(await free.request(technical('ana', 'mal'))).toMatchObject({
      code: 'invalid_credentials',
    });
  });

  it('REQ-003-45: el panel recibe un solo aviso por bloqueo, también si se conecta durante el minuto', async () => {
    const beto = await loginAsStaff(world.testApp, 'beto', 'encargado', 'Beto');
    const address = world.url.replace(/\/pc$/, '/panel');
    const early = PanelClient.connect(address, beto);
    await early.nextMap();
    const pc = await world.pc(4);
    for (let i = 0; i < 10; i++) await pc.request(technical('ana', 'mal'));
    const lockedUntil = new Date(world.clock.now().getTime() + 60_000).toISOString();
    expect(await early.nextTechnicalLock()).toEqual({
      type: 'technicalLoginLocked',
      staffName: 'Ana',
      username: 'ana',
      pc: { id: devPcId(4), name: 'PC 04' },
      lockedUntil,
    });

    // Un panel que se conecta con el bloqueo vigente lo recibe una vez.
    const late = PanelClient.connect(address, beto);
    expect(await late.nextTechnicalLock()).toMatchObject({ staffName: 'Ana', lockedUntil });
    for (let i = 0; i < 3; i++) await pc.request(technical('ana', 'mal'));
    await pc.request({ type: 'listCombos', requestId: 'sync' });
    early.close();
    late.close();

    // Pasado el minuto, quien se conecta ya no ve el aviso.
    world.clock.advance(61_000);
    const after = PanelClient.connect(address, beto);
    await after.nextMap();
    await after.nextPending();
    await after.nextRate();
    await expect(
      Promise.race([
        after.nextTechnicalLock(),
        new Promise((resolve) =>
          setTimeout(() => {
            resolve('sin aviso');
          }, 300),
        ),
      ]),
    ).resolves.toBe('sin aviso');
    after.close();
  });
});
