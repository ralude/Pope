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

import { events, pcCommands } from '../db/schema.js';
import { devPcId } from '../pcs/dev-pcs.js';
import { loginAsStaff } from '../testing/auth.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { PcTestClient } from '../testing/pc-client.js';
import { activeSession, login, PcWorld } from '../testing/pc-world.js';

// 18:00 en Caracas de un lunes.
const MONDAY = '2026-09-28T22:00:00Z';

describe('órdenes del panel a las PCs (e2e, REQ-003-20, T28)', () => {
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

  /** PC cuyo agente no responde solo a los bloqueos: el test decide cada acuse. */
  async function manual(n: number) {
    const pc = await world.pc(n);
    pc.autoLock = false;
    return pc;
  }

  async function snapshot(n: number, cookie = ana) {
    const response = await world.api('GET', `/pcs/${devPcId(n)}/control`, cookie);
    return response.json<PcControlSnapshot>();
  }

  async function order(n: number, body: object, cookie = ana) {
    return world.api('POST', `/pcs/${devPcId(n)}/commands`, cookie, body);
  }

  /** Pide una orden con el contexto vigente de la PC; devuelve la respuesta del nodo. */
  async function issue(n: number, kind: 'lock' | 'restart' | 'powerOff', id = newId()) {
    const { context } = await snapshot(n);
    const response = await order(n, { id, kind, expected: context });
    expect(response.statusCode).toBe(200);
    return response.json<PcCommandResponse>();
  }

  /**
   * Espera a que la PC tenga todo lo que el nodo le envió antes: el nodo procesa los mensajes
   * de cada PC en orden y le escribe por el mismo canal.
   */
  async function sync(pc: PcTestClient) {
    expect(await pc.request({ type: 'listCombos', requestId: 'sync' })).toMatchObject({
      type: 'combos',
    });
  }

  /** Última orden que recibió la PC; antes le llegó el contexto con el que la compara. */
  async function received(pc: PcTestClient) {
    await sync(pc);
    const command = pc.commands.at(-1);
    if (!command) throw new Error('La PC no recibió ninguna orden');
    expect(pc.control?.context).toEqual(command.expected);
    return command;
  }

  /** La PC responde a una orden y espera a que el nodo lo procese. */
  async function ack(pc: PcTestClient, commandId: string, result: PcCommandResult) {
    pc.send({ type: 'commandAck', commandId, occurredAt: world.clock.now().toISOString(), result });
    await sync(pc);
  }

  async function eventsOf(type: DomainEvent['type']) {
    return (await db().select().from(events).orderBy(asc(events.seq))).filter(
      (e) => e.type === type,
    );
  }

  const applied = { status: 'applied', effect: { kind: 'lock' } } as const;

  it('REQ-003-20: la PC recibe la orden con su contexto y queda reservada para los clientes', async () => {
    const pc = await manual(4);
    const response = await issue(4, 'restart');
    expect(response).toMatchObject({
      status: 'requested',
      lastResult: null,
      command: {
        pcId: devPcId(4),
        actor: { kind: 'staff', name: 'Ana' },
        action: { kind: 'restart' },
      },
    });
    expect(await received(pc)).toEqual(response.command);
    expect((await snapshot(4)).reservation?.command.id).toBe(response.command.id);
    expect(await login(pc, 'juan')).toMatchObject({ type: 'error', code: 'pc_unavailable' });
    expect(await eventsOf('pc.command_requested')).toMatchObject([
      {
        actor: { kind: 'staff', name: 'Ana' },
        payload: {
          commandId: response.command.id,
          pc: { id: devPcId(4), name: 'PC 04' },
          kind: 'restart',
          replacesCommandId: null,
        },
      },
    ]);
  });

  it('REQ-003-20: doble clic con el mismo ID devuelve la misma orden y la envía una vez', async () => {
    const pc = await manual(4);
    const { context } = await snapshot(4);
    const body = { id: newId(), kind: 'lock', expected: context };
    const [first, second] = await Promise.all([order(4, body), order(4, body)]);
    expect(first.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    await received(pc);
    expect(pc.commands).toHaveLength(1);
    expect(await db().select().from(pcCommands)).toHaveLength(1);
    expect(await eventsOf('pc.command_requested')).toHaveLength(1);

    const reused = await order(4, { ...body, kind: 'restart' });
    expect(reused.statusCode).toBe(409);
    expect(reused.json()).toMatchObject({ code: 'idempotency_conflict' });
    const elsewhere = await order(5, body);
    expect(elsewhere.json()).toMatchObject({ code: 'idempotency_conflict' });
  });

  it('REQ-003-20: no admite otra orden mientras una sigue en curso', async () => {
    await manual(4);
    await issue(4, 'lock');
    const { context } = await snapshot(4);
    const second = await order(4, { id: newId(), kind: 'restart', expected: context });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ code: 'pc_unavailable' });
  });

  it('REQ-003-20: rechaza contexto viejo, PC desconectada o desconocida, dueño y tipos aún no disponibles', async () => {
    const pc = await manual(4);
    const { context } = await snapshot(4);
    const stale = await order(4, {
      id: newId(),
      kind: 'lock',
      expected: { ...context, revision: newId() },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: 'stale_context' });

    // Con una sesión abierta, una orden confirmada con la PC libre ya no vale.
    activeSession(await login(pc, 'juan'));
    const afterLogin = await order(4, { id: newId(), kind: 'restart', expected: context });
    expect(afterLogin.json()).toMatchObject({ code: 'stale_context' });

    const offline = await order(6, {
      id: newId(),
      kind: 'lock',
      expected: (await snapshot(6)).context,
    });
    expect(offline.statusCode).toBe(409);
    expect(offline.json()).toMatchObject({ code: 'pc_disconnected' });

    const unknown = await world.api('POST', `/pcs/${newId()}/commands`, ana, {
      id: newId(),
      kind: 'lock',
      expected: context,
    });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({ code: 'unknown_pc' });

    const owner = await loginAsStaff(world.testApp, 'eva', 'dueno', 'Eva');
    expect((await snapshot(5, owner)).context.kind).toBe('free');
    const forbidden = await order(
      5,
      { id: newId(), kind: 'lock', expected: (await snapshot(5)).context },
      owner,
    );
    expect(forbidden.statusCode).toBe(403);

    const maintenance = await order(5, {
      id: newId(),
      kind: 'startMaintenance',
      expected: (await snapshot(5)).context,
    });
    expect(maintenance.statusCode).toBe(400);
    expect(maintenance.json()).toMatchObject({ code: 'invalid_command' });
    const malformed = await order(5, { id: 'x', kind: 'lock' });
    expect(malformed.json()).toMatchObject({ code: 'invalid_command' });
    expect(await db().select().from(pcCommands)).toEqual([]);
  });

  it('REQ-003-20: el efecto confirmado libera la PC; los acuses repetidos o contradictorios no cambian nada', async () => {
    const pc = await manual(4);
    const { command } = await issue(4, 'lock');
    await received(pc);
    await ack(pc, command.id, { status: 'accepted', kind: 'lock' });
    expect((await snapshot(4)).reservation).toMatchObject({ status: 'accepted' });
    await ack(pc, command.id, applied);
    await ack(pc, command.id, applied);
    await ack(pc, command.id, { status: 'accepted', kind: 'lock' });
    await ack(pc, command.id, {
      status: 'failed',
      kind: 'lock',
      code: 'native_failure',
      message: 'Fallo',
    });
    expect((await snapshot(4)).reservation).toBeNull();
    const [row] = await db().select().from(pcCommands);
    expect(row).toMatchObject({ status: 'applied', lastResult: applied });
    expect((await eventsOf('pc.command_acknowledged')).map((e) => e.payload)).toMatchObject([
      { status: 'accepted', reservationReleased: false, late: false },
      { status: 'applied', reservationReleased: true, late: false },
    ]);
    activeSession(await login(pc, 'juan'));
  });

  it('REQ-003-63: una PC no puede responder por otra ni con un efecto distinto', async () => {
    const pc4 = await manual(4);
    const pc5 = await manual(5);
    const { command } = await issue(4, 'restart');
    await ack(pc5, command.id, { status: 'accepted', kind: 'restart' });
    await ack(pc4, command.id, { status: 'accepted', kind: 'lock' });
    expect((await snapshot(4)).reservation).toMatchObject({ status: 'requested' });
    expect(await eventsOf('pc.command_acknowledged')).toEqual([]);
  });

  it('REQ-003-20: a los 30 s sin respuesta vence y conserva la reserva; un acuse tardío se registra', async () => {
    const pc = await manual(4);
    const { command } = await issue(4, 'lock');
    await world.clock.tick(30_000);
    expect((await snapshot(4)).reservation).toMatchObject({ status: 'expired' });
    expect(await eventsOf('pc.command_expired')).toHaveLength(1);
    expect(await login(pc, 'juan')).toMatchObject({ code: 'pc_unavailable' });

    await ack(pc, command.id, applied);
    expect((await eventsOf('pc.command_acknowledged'))[0]?.payload).toMatchObject({
      status: 'applied',
      late: true,
      reservationReleased: true,
    });
    activeSession(await login(pc, 'juan'));
  });

  it('REQ-003-20: una orden nueva toma la reserva de una vencida o fallida; un fallo sin efecto la libera', async () => {
    const pc = await manual(4);
    const first = await issue(4, 'lock');
    await world.clock.tick(30_000);
    const second = await issue(4, 'lock');
    expect((await eventsOf('pc.command_requested'))[1]?.payload).toMatchObject({
      replacesCommandId: first.command.id,
    });
    await ack(pc, second.command.id, {
      status: 'failed',
      kind: 'lock',
      code: 'native_failure',
      message: 'Windows no cambió de escritorio',
    });
    expect((await snapshot(4)).reservation?.command.id).toBe(second.command.id);

    const third = await issue(4, 'restart');
    await ack(pc, third.command.id, {
      status: 'failed',
      kind: 'restart',
      code: 'stale_context',
      message: 'Contexto distinto',
    });
    expect((await snapshot(4)).reservation).toBeNull();
  });

  it('REQ-003-20: un reinicio aceptado mantiene la reserva hasta que la PC vuelve', async () => {
    const pc = await manual(4);
    const { command } = await issue(4, 'restart');
    await ack(pc, command.id, { status: 'accepted', kind: 'restart' });
    await world.clock.tick(60_000);
    expect((await snapshot(4)).reservation).toMatchObject({ status: 'accepted' });
    expect(await login(pc, 'juan')).toMatchObject({ code: 'pc_unavailable' });

    pc.close();
    await pc.closed;
    const back = await manual(4);
    expect((await snapshot(4)).reservation).toBeNull();
    expect((await eventsOf('pc.reservation_released'))[0]).toMatchObject({
      actor: { kind: 'system' },
      payload: { commandId: command.id, kind: 'restart', reason: 'reconnected' },
    });
    activeSession(await login(back, 'juan'));
  });

  it('REQ-003-20: si la PC se reconecta antes de vencer, recibe otra vez la orden pendiente', async () => {
    const pc = await manual(4);
    const { command } = await issue(4, 'powerOff');
    pc.close();
    await pc.closed;
    world.clock.advance(10_000);
    const { pc: back } = await PcTestClient.hello(world.url, devPcId(4));
    try {
      expect(await received(back)).toEqual(command);
    } finally {
      back.close();
    }
  });

  it('REQ-003-20: login y orden simultáneos en la misma PC: solo uno de los dos ocupa la PC', async () => {
    const pc = await manual(4);
    const { context } = await snapshot(4);
    const [state, response] = await Promise.all([
      login(pc, 'juan'),
      order(4, { id: newId(), kind: 'restart', expected: context }),
    ]);
    if (response.statusCode === 200) {
      expect(state).toMatchObject({ type: 'error', code: 'pc_unavailable' });
    } else {
      expect(response.json()).toMatchObject({ code: 'stale_context' });
      activeSession(state);
    }
  });
});
