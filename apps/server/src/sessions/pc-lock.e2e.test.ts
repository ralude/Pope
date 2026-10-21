import {
  type DomainEvent,
  newId,
  type PcCommandResponse,
  type PcControlSnapshot,
  usd,
} from '@pope/shared';
import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events, ledger, sessions } from '../db/schema.js';
import { devPcId } from '../pcs/dev-pcs.js';
import { loginAsStaff } from '../testing/auth.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { PcTestClient } from '../testing/pc-client.js';
import { activeSession, login, PcWorld } from '../testing/pc-world.js';

const MINUTE = 60_000;
// 18:00 en Caracas de un lunes: 1,50 USD/h.
const MONDAY = '2026-09-28T22:00:00Z';
const APPLIED = { status: 'applied', effect: { kind: 'lock' } } as const;

describe('bloquear mediante el cierre de la sesión (e2e, REQ-003-20, REQ-003-34, T29)', () => {
  let world: PcWorld;
  let ana: string;

  beforeEach(async () => {
    world = await PcWorld.start(MONDAY);
    ana = await world.cashier();
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

  async function snapshot(n: number) {
    return (await world.api('GET', `/pcs/${devPcId(n)}/control`, ana)).json<PcControlSnapshot>();
  }

  /** «Bloquear» desde el panel con el contexto vigente de la PC. */
  async function lock(n: number, id = newId()) {
    const { context } = await snapshot(n);
    return world.api('POST', `/pcs/${devPcId(n)}/commands`, ana, {
      id,
      kind: 'lock',
      expected: context,
    });
  }

  /** Mensajes que la PC recibió hasta ahora, sin los de la cola de respuestas. */
  async function sync(pc: PcTestClient) {
    await pc.request({ type: 'listCombos', requestId: 'sync' });
  }

  async function ack(pc: PcTestClient, commandId: string, result: object) {
    pc.send({ type: 'commandAck', commandId, occurredAt: world.clock.now().toISOString(), result });
    await sync(pc);
  }

  async function eventsOf(type: DomainEvent['type']) {
    return (await db().select().from(events).orderBy(asc(events.seq))).filter(
      (e) => e.type === type,
    );
  }

  async function consumption() {
    return db().select().from(ledger).where(eq(ledger.kind, 'consumption'));
  }

  it('REQ-003-20: Bloquear con una sesión la cierra, cobra hasta ese instante y reserva la PC', async () => {
    const pc = await manual(4);
    const sessionId = activeSession(await login(pc, 'juan')).sessionId;
    await world.run(4, 20 * MINUTE);
    const id = newId();

    const response = await lock(4, id);

    expect(response.statusCode).toBe(200);
    const order = response.json<PcCommandResponse>();
    expect(order).toMatchObject({
      status: 'requested',
      command: { id, actor: { kind: 'staff', name: 'Ana' }, expected: { kind: 'free' } },
    });
    // Primero el fin de la sesión; después el bloqueo, con el contexto libre ya recibido.
    expect(await pc.next()).toEqual({ type: 'sessionEnded', sessionId, reason: 'staff' });
    await sync(pc);
    expect(pc.commands.at(-1)).toEqual(order.command);
    expect(pc.control?.context).toEqual(order.command.expected);
    const [closed] = await db().select().from(sessions).where(eq(sessions.id, sessionId));
    expect(closed).toMatchObject({ status: 'ended', endReason: 'staff' });
    expect(await consumption()).toHaveLength(1);
    expect((await eventsOf('session.ended'))[0]).toMatchObject({ actor: { name: 'Ana' } });

    // Ni cobro después del cierre ni clientes nuevos hasta que el agente confirme.
    await world.run(4, 10 * MINUTE);
    expect(await consumption()).toHaveLength(1);
    expect(await login(pc, 'juan')).toMatchObject({ type: 'error', code: 'pc_unavailable' });
    await ack(pc, id, APPLIED);
    activeSession(await login(pc, 'juan'));
  });

  it('REQ-003-20: el doble clic en Bloquear devuelve la misma orden y no cierra dos veces', async () => {
    const pc = await manual(4);
    activeSession(await login(pc, 'juan'));
    const { context } = await snapshot(4);
    const body = { id: newId(), kind: 'lock', expected: context };
    const first = await world.api('POST', `/pcs/${devPcId(4)}/commands`, ana, body);
    const second = await world.api('POST', `/pcs/${devPcId(4)}/commands`, ana, body);
    expect(second.json()).toEqual(first.json());
    expect(await eventsOf('session.ended')).toHaveLength(1);
    // Con la PC ya libre, el contexto de sesión confirmado antes ya no vale para otra orden.
    const stale = await world.api('POST', `/pcs/${devPcId(4)}/commands`, ana, {
      ...body,
      id: newId(),
    });
    expect(stale.json()).toMatchObject({ code: 'stale_context' });
  });

  it('REQ-003-20: Bloquear una pausa cierra la sesión y la pausa, sin seguir cobrando', async () => {
    const pc = await manual(4);
    const sessionId = activeSession(await login(pc, 'juan')).sessionId;
    await world.run(4, 5 * MINUTE);
    await pc.request({ type: 'pause', requestId: 'pause-1' });
    expect((await lock(4)).statusCode).toBe(200);
    expect(await pc.next()).toMatchObject({ type: 'sessionEnded', sessionId, reason: 'staff' });
    expect((await eventsOf('session.ended'))[0]?.payload).toMatchObject({ sessionId });
  });

  it('REQ-001-69: Bloquear una temporal la cierra y su tiempo restante se pierde', async () => {
    const { pc, session } = await world.openTemporary(ana, 4, 30);
    pc.autoLock = false;
    expect((await lock(4)).statusCode).toBe(200);
    expect(await pc.next()).toMatchObject({ type: 'sessionEnded', sessionId: session.id });
    expect(await eventsOf('pc.command_requested')).toMatchObject([
      { actor: { kind: 'staff', name: 'Ana' }, payload: { kind: 'lock' } },
    ]);
    const reopen = await world.api('POST', '/sessions/temporary', ana, {
      pcId: devPcId(4),
      paymentMethod: 'cash_usd',
      minutes: 30,
    });
    expect(reopen.statusCode).toBe(409);
  });

  it('REQ-003-34: si el cliente sale, el sistema bloquea; una limpieza fallida deja la PC sin clientes', async () => {
    const pc = await manual(4);
    activeSession(await login(pc, 'juan'));
    expect(await pc.request({ type: 'logout', requestId: 'logout-1' })).toMatchObject({
      type: 'sessionEnded',
    });
    await sync(pc);
    const command = pc.commands.at(-1);
    expect(command).toMatchObject({ actor: { kind: 'system' }, action: { kind: 'lock' } });
    await ack(pc, command?.id ?? '', {
      status: 'failed',
      kind: 'lock',
      code: 'native_failure',
      message: 'Quedan procesos del cliente',
    });
    expect((await snapshot(4)).reservation).toMatchObject({ status: 'failed' });
    expect(await login(pc, 'juan')).toMatchObject({ code: 'pc_unavailable' });

    // Al reconectar no se repite solo: lo decide el personal pulsando Bloquear otra vez.
    pc.close();
    await pc.closed;
    const back = await manual(4);
    expect(back.commands).toEqual([]);
    const retry = (await lock(4)).json<PcCommandResponse>();
    await sync(back);
    await ack(back, retry.command.id, APPLIED);
    expect((await eventsOf('pc.command_requested')).at(-1)?.payload).toMatchObject({
      replacesCommandId: command?.id,
    });
    activeSession(await login(back, 'juan'));
  });

  it('REQ-003-34: un fallo sin efecto tampoco libera la PC de un bloqueo', async () => {
    const pc = await manual(4);
    activeSession(await login(pc, 'juan'));
    await pc.request({ type: 'logout', requestId: 'logout-1' });
    await sync(pc);
    await ack(pc, pc.commands.at(-1)?.id ?? '', {
      status: 'failed',
      kind: 'lock',
      code: 'stale_context',
      message: 'Contexto distinto',
    });
    expect((await snapshot(4)).reservation).not.toBeNull();
  });

  it('REQ-003-34: al agotarse el saldo, el sistema bloquea y el encargado ve la reserva', async () => {
    const pc = await manual(4);
    activeSession(await login(pc, 'juan'));
    await world.run(4, 121 * MINUTE);
    expect((await snapshot(4)).reservation).toMatchObject({
      command: { actor: { kind: 'system' }, action: { kind: 'lock' } },
    });
    const ended = await eventsOf('session.ended');
    expect(ended.at(-1)?.payload).toMatchObject({ reason: 'exhausted' });
  });

  it('REQ-003-34: un cierre sin latidos con la PC apagada se vuelve a pedir cuando reconecta', async () => {
    const pc = await manual(4);
    activeSession(await login(pc, 'juan'));
    await world.run(4, MINUTE);
    pc.close();
    await pc.closed;
    // Sin latidos: el nodo la cierra; la orden vence sin nadie que la reciba.
    await world.clock.tick(4 * MINUTE);
    const [first] = await eventsOf('pc.command_requested');
    expect(first).toMatchObject({ actor: { kind: 'system' } });
    expect(await eventsOf('pc.command_expired')).toHaveLength(1);

    world.clock.advance(MINUTE);
    // La PC vuelve tras el corte, ya sin sesión; su agente aplica el bloqueo que se repite.
    const back = await world.pc(4);
    expect((await eventsOf('pc.command_requested')).at(-1)?.payload).toMatchObject({
      replacesCommandId: first?.payload.commandId,
    });
    expect((await snapshot(4)).reservation).toBeNull();
    activeSession(await login(back, 'juan'));
  });

  it('REQ-003-20: el cierre desde el panel también reserva la PC a nombre del encargado', async () => {
    const pc = await manual(4);
    const sessionId = activeSession(await login(pc, 'juan')).sessionId;
    const luis = await loginAsStaff(world.testApp, 'luis', 'encargado', 'Luis');
    expect((await world.api('POST', `/sessions/${sessionId}/close`, luis)).statusCode).toBe(204);
    expect((await snapshot(4)).reservation).toMatchObject({
      command: { actor: { kind: 'staff', name: 'Luis' } },
    });
  });
});
