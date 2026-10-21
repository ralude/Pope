import {
  type DomainEvent,
  newId,
  type PcCommandResponse,
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

describe('mensajes del encargado (e2e, REQ-003-20, T32)', () => {
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

  async function snapshot(n: number) {
    return (await world.api('GET', `/pcs/${devPcId(n)}/control`, ana)).json<PcControlSnapshot>();
  }

  async function send(n: number, text = 'Tu sesión termina pronto', cookie = ana) {
    const { context } = await snapshot(n);
    return world.api('POST', `/pcs/${devPcId(n)}/commands`, cookie, {
      id: newId(),
      kind: 'showMessage',
      expected: context,
      text,
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

  it('REQ-003-20: con la PC libre o en sesión llega a la PC sin reservarla ni cerrar nada', async () => {
    const pc = await world.pc(4);
    const free = await send(4);
    expect(free.statusCode).toBe(200);
    await sync(pc);
    expect(pc.commands.at(-1)).toMatchObject({
      action: { kind: 'showMessage', text: 'Tu sesión termina pronto' },
      expected: { kind: 'free' },
    });
    expect((await snapshot(4)).reservation).toBeNull();

    const sessionId = activeSession(await login(pc, 'juan')).sessionId;
    expect((await send(4, 'Hola Juan')).statusCode).toBe(200);
    await sync(pc);
    expect(pc.commands.at(-1)).toMatchObject({ expected: { kind: 'session', sessionId } });
    expect((await snapshot(4)).context).toMatchObject({ kind: 'session', sessionId });
    // La auditoría registra quién envió el mensaje y a qué PC, no su texto.
    const requested = await eventsOf('pc.command_requested');
    expect(requested).toHaveLength(2);
    expect(JSON.stringify(requested)).not.toContain('Hola Juan');
  });

  it('REQ-003-20: en pausa también se admite; con otra orden en curso, igual', async () => {
    const pc = await world.pc(4);
    activeSession(await login(pc, 'juan'));
    await pc.request({ type: 'pause', requestId: 'pause-1' });
    expect((await send(4)).statusCode).toBe(200);
    pc.autoLock = false;
    const { context } = await snapshot(4);
    await world.api('POST', `/pcs/${devPcId(4)}/commands`, ana, {
      id: newId(),
      kind: 'lock',
      expected: context,
    });
    expect((await send(4)).statusCode).toBe(200);
  });

  it('REQ-003-20: entregado solo cuando la PC confirma que lo mostró; si no, vence', async () => {
    const pc = await world.pc(4);
    const shown = (await send(4)).json<PcCommandResponse>();
    const lost = (await send(4, 'Otro')).json<PcCommandResponse>();
    await sync(pc);
    pc.send({
      type: 'commandAck',
      commandId: shown.command.id,
      occurredAt: world.clock.now().toISOString(),
      result: { status: 'applied', effect: { kind: 'showMessage' } },
    });
    await sync(pc);
    await world.clock.tick(30_000);
    const acknowledged = await eventsOf('pc.command_acknowledged');
    expect(acknowledged.map((e) => e.payload)).toMatchObject([
      { commandId: shown.command.id, status: 'applied', reservationReleased: false },
    ]);
    expect((await eventsOf('pc.command_expired')).map((e) => e.payload)).toMatchObject([
      { commandId: lost.command.id },
    ]);
  });

  it('REQ-003-20: al reenviarlo tras reconectar va con el contexto de ahora, no el de la sesión que ya terminó', async () => {
    const pc = await world.pc(4);
    const sessionId = activeSession(await login(pc, 'juan')).sessionId;
    const { command } = (await send(4, 'Para Juan')).json<PcCommandResponse>();
    expect(command.expected).toMatchObject({ kind: 'session', sessionId });
    pc.close();
    await pc.closed;
    // El encargado cierra la sesión mientras la PC no está: el mensaje ya no es para nadie.
    expect((await world.api('POST', `/sessions/${sessionId}/close`, ana)).statusCode).toBe(204);
    const back = await world.pc(4);
    const resent = back.commands.find((c) => c.id === command.id);
    expect(resent).toBeDefined();
    expect(back.control?.context.kind).toBe('free');
    expect(back.control?.context).not.toEqual(command.expected);
  });

  it('REQ-003-20: en mantenimiento se rechaza; el dueño no envía mensajes; el texto está acotado', async () => {
    await world.pc(4);
    expect((await send(4, 'a'.repeat(1_001))).json()).toMatchObject({ code: 'invalid_command' });
    expect((await send(4, '')).json()).toMatchObject({ code: 'invalid_command' });
    const owner = await loginAsStaff(world.testApp, 'eva', 'dueno', 'Eva');
    expect((await send(4, 'Hola', owner)).statusCode).toBe(403);
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
    const refused = await send(4);
    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({ code: 'invalid_command' });
  });
});
