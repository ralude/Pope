import {
  type DomainEvent,
  newId,
  type PcCommandResponse,
  type PcControlSnapshot,
  usd,
} from '@pope/shared';
import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { events, pcCommands, sessions } from '../db/schema.js';
import { devPcId } from '../pcs/dev-pcs.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import type { PcTestClient } from '../testing/pc-client.js';
import { activeSession, login, PcWorld } from '../testing/pc-world.js';
import { SessionsService } from './sessions.service.js';

const MINUTE = 60_000;
// 18:00 en Caracas de un lunes: 1,50 USD/h.
const MONDAY = '2026-09-28T22:00:00Z';

describe('reiniciar y apagar con confirmación (e2e, REQ-003-20, T30)', () => {
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

  async function power(
    n: number,
    kind: 'restart' | 'powerOff',
    extra: object = { confirmed: true },
  ) {
    const { context } = await snapshot(n);
    return world.api('POST', `/pcs/${devPcId(n)}/commands`, ana, {
      id: newId(),
      kind,
      expected: context,
      ...extra,
    });
  }

  async function sync(pc: PcTestClient) {
    await pc.request({ type: 'listCombos', requestId: 'sync' });
  }

  async function eventsOf(type: DomainEvent['type']) {
    return (await db().select().from(events).orderBy(asc(events.seq))).filter(
      (e) => e.type === type,
    );
  }

  it('REQ-003-20: con una sesión abierta, reiniciar sin confirmar no cierra nada', async () => {
    const pc = await manual(4);
    const sessionId = activeSession(await login(pc, 'juan')).sessionId;
    const response = await power(4, 'restart', {});
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'confirmation_required' });
    const [row] = await db().select().from(sessions).where(eq(sessions.id, sessionId));
    expect(row?.status).toBe('active');
    expect(await db().select().from(pcCommands)).toEqual([]);
  });

  it('REQ-003-20: reiniciar confirmado cierra la sesión, cobra hasta ese instante y después ordena reiniciar', async () => {
    const pc = await manual(4);
    const sessionId = activeSession(await login(pc, 'juan')).sessionId;
    await world.run(4, 10 * MINUTE);

    const response = await power(4, 'restart');

    expect(response.statusCode).toBe(200);
    const order = response.json<PcCommandResponse>();
    expect(order.command).toMatchObject({
      actor: { kind: 'staff', name: 'Ana' },
      expected: { kind: 'free' },
      action: { kind: 'restart' },
    });
    expect(await pc.next()).toEqual({ type: 'sessionEnded', sessionId, reason: 'staff' });
    await sync(pc);
    expect(pc.commands).toEqual([order.command]);
    expect((await eventsOf('session.ended'))[0]).toMatchObject({ actor: { name: 'Ana' } });
    // Hasta que la PC vuelva tras reiniciar, no admite clientes.
    expect(await login(pc, 'juan')).toMatchObject({ code: 'pc_unavailable' });
  });

  it('REQ-003-20: apagar una pausa o una temporal también cierra antes la sesión', async () => {
    const pc = await manual(4);
    const sessionId = activeSession(await login(pc, 'juan')).sessionId;
    await pc.request({ type: 'pause', requestId: 'pause-1' });
    expect((await power(4, 'powerOff')).statusCode).toBe(200);
    expect(await pc.next()).toMatchObject({ type: 'sessionEnded', sessionId });

    const { pc: other, session } = await world.openTemporary(ana, 5, 30);
    other.autoLock = false;
    expect((await power(5, 'powerOff')).statusCode).toBe(200);
    expect(await other.next()).toMatchObject({ type: 'sessionEnded', sessionId: session.id });
    const ended = await eventsOf('session.ended');
    expect(ended.map((e) => e.payload)).toMatchObject([{ sessionId }, { sessionId: session.id }]);
  });

  it('REQ-003-20: si la sesión cambió después de confirmar, no se cierra ni se envía nada', async () => {
    const pc = await manual(4);
    activeSession(await login(pc, 'juan'));
    const { context } = await snapshot(4);
    await pc.request({ type: 'logout', requestId: 'logout-1' });
    const stale = await world.api('POST', `/pcs/${devPcId(4)}/commands`, ana, {
      id: newId(),
      kind: 'restart',
      expected: context,
      confirmed: true,
    });
    expect(stale.json()).toMatchObject({ code: 'stale_context' });
    expect(await eventsOf('pc.command_requested')).toMatchObject([{ payload: { kind: 'lock' } }]);
  });

  it('REQ-003-20: si falla el cierre previo, la orden no se guarda ni se envía', async () => {
    const pc = await manual(4);
    const sessionId = activeSession(await login(pc, 'juan')).sessionId;
    const service = world.testApp.app.get(SessionsService);
    const spy = vi.spyOn(service, 'closeIn').mockRejectedValueOnce(new Error('Fallo simulado'));
    try {
      expect((await power(4, 'restart')).statusCode).toBe(500);
    } finally {
      spy.mockRestore();
    }
    await sync(pc);
    expect(pc.commands).toEqual([]);
    expect(await db().select().from(pcCommands)).toEqual([]);
    const [row] = await db().select().from(sessions).where(eq(sessions.id, sessionId));
    expect(row?.status).toBe('active');
  });

  it('REQ-003-34: si el reinicio que cerró una sesión no se ejecuta, la PC se bloquea y limpia', async () => {
    const pc = await manual(4);
    activeSession(await login(pc, 'juan'));
    const { command } = (await power(4, 'restart')).json<PcCommandResponse>();
    await pc.next();
    await sync(pc);
    pc.send({
      type: 'commandAck',
      commandId: command.id,
      occurredAt: world.clock.now().toISOString(),
      result: {
        status: 'failed',
        kind: 'restart',
        code: 'invalid_action',
        message: 'No disponible',
      },
    });
    await sync(pc);
    const lock = pc.commands.at(-1);
    expect(lock).toMatchObject({ actor: { kind: 'system' }, action: { kind: 'lock' } });
    expect((await snapshot(4)).reservation?.command.id).toBe(lock?.id);
    expect(await login(pc, 'juan')).toMatchObject({ code: 'pc_unavailable' });
  });

  it('REQ-003-34: un reinicio que cerró una sesión y venció sin respuesta se cambia por un bloqueo al reconectar', async () => {
    const pc = await manual(4);
    activeSession(await login(pc, 'juan'));
    const { command } = (await power(4, 'restart')).json<PcCommandResponse>();
    pc.close();
    await pc.closed;
    await world.clock.tick(31_000);
    const back = await world.pc(4);
    expect((await eventsOf('pc.command_requested')).at(-1)?.payload).toMatchObject({
      kind: 'lock',
      replacesCommandId: command.id,
    });
    expect((await snapshot(4)).reservation).toBeNull();
    activeSession(await login(back, 'juan'));
  });

  it('REQ-003-34/T31: tras un reinicio aceptado que cerró una sesión, la PC vuelve y se bloquea antes de admitir clientes', async () => {
    const pc = await manual(4);
    activeSession(await login(pc, 'juan'));
    const { command } = (await power(4, 'restart')).json<PcCommandResponse>();
    await pc.next();
    await sync(pc);
    pc.send({
      type: 'commandAck',
      commandId: command.id,
      occurredAt: world.clock.now().toISOString(),
      result: { status: 'accepted', kind: 'restart' },
    });
    await sync(pc);
    pc.close();
    await pc.closed;
    await world.clock.tick(2 * MINUTE);
    const back = await world.pc(4);
    expect(await eventsOf('pc.reservation_released')).toEqual([]);
    expect((await eventsOf('pc.command_requested')).at(-1)?.payload).toMatchObject({
      kind: 'lock',
      replacesCommandId: command.id,
    });
    expect((await snapshot(4)).reservation).toBeNull();
    activeSession(await login(back, 'juan'));
  });

  it('REQ-003-20/T31: un reinicio de una PC libre cuyo acuse se perdió no la deja reservada al volver', async () => {
    const pc = await manual(4);
    const { command } = (await power(4, 'restart', {})).json<PcCommandResponse>();
    // Windows reinicia antes de que salga el acuse: la orden vence sin respuesta.
    pc.close();
    await pc.closed;
    await world.clock.tick(31_000);
    const back = await world.pc(4);
    expect((await eventsOf('pc.command_requested')).at(-1)?.payload).toMatchObject({
      kind: 'lock',
      replacesCommandId: command.id,
    });
    activeSession(await login(back, 'juan'));
  });
});
