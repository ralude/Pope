import { type DomainEvent, newId, type PcRevokeResponse, usd } from '@pope/shared';
import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events, pcCredentials, sessionHolds, sessions } from '../db/schema.js';
import { devPcId } from '../pcs/dev-pcs.js';
import { loginAsStaff } from '../testing/auth.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { PcTestClient } from '../testing/pc-client.js';
import { activeSession, login, PcWorld } from '../testing/pc-world.js';

// 18:00 en Caracas de un lunes.
const MONDAY = '2026-09-28T22:00:00Z';

describe('revocar una PC conservando su sesión (e2e, REQ-003-11, T34c)', () => {
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
  const revokePath = (n: number) => '/pcs/' + devPcId(n) + '/revoke';
  const revoke = (n: number, id = newId(), cookie: string | null = ana) =>
    world.api('POST', revokePath(n), cookie, { id });

  async function eventsOf(type: DomainEvent['type']) {
    return (await db().select().from(events).orderBy(asc(events.seq))).filter(
      (e) => e.type === type,
    );
  }

  it('REQ-003-11: revocar una PC libre invalida su credencial y corta la conexión con el motivo', async () => {
    const pc = await world.pc(4);
    const response = await revoke(4);
    expect(response.statusCode).toBe(200);
    expect(response.json<PcRevokeResponse>()).toMatchObject({
      pc: { name: 'PC 04' },
      heldSessionId: null,
    });
    expect(await pc.next()).toMatchObject({
      type: 'pcAuthenticationError',
      code: 'pc_credential_revoked',
    });
    expect((await pc.closed).code).toBe(1008);
    const [credential] = await db()
      .select()
      .from(pcCredentials)
      .where(eq(pcCredentials.pcId, devPcId(4)));
    expect(credential?.revokedAt).not.toBeNull();
    expect(await eventsOf('pc.credential_revoked')).toMatchObject([
      {
        actor: { kind: 'staff', name: 'Ana' },
        payload: { pc: { name: 'PC 04' }, heldSessionId: null },
      },
    ]);
    expect(await db().select().from(sessionHolds)).toEqual([]);
    // La credencial anterior ya no admite conexiones.
    await expect(PcTestClient.hello(world.url, devPcId(4))).rejects.toThrow();
  });

  it('REQ-003-11: con una sesión de cuenta la conserva retenida, cobrada hasta el instante de la revocación', async () => {
    const pc = await world.pc(4);
    const sessionId = activeSession(await login(pc, 'juan')).sessionId;
    await world.run(4, 120_000);
    const response = await revoke(4);
    expect(response.json<PcRevokeResponse>().heldSessionId).toBe(sessionId);

    const [session] = await db().select().from(sessions).where(eq(sessions.id, sessionId));
    expect(session?.status).toBe('active');
    // Se cobraron los 2 min vividos y la marca de cobro quedó en el instante de la revocación.
    expect(session?.lastHeartbeatAt.toISOString()).toBe(world.clock.now().toISOString());
    const [hold] = await db().select().from(sessionHolds);
    expect(hold).toMatchObject({
      sessionId,
      pcId: devPcId(4),
      startedBy: { kind: 'staff', name: 'Ana' },
      endedAt: null,
    });
    expect(hold?.startedAt.toISOString()).toBe(world.clock.now().toISOString());
    expect(await eventsOf('pc.credential_revoked')).toMatchObject([
      { payload: { heldSessionId: sessionId } },
    ]);
  });

  it('REQ-003-11: una temporal y una sesión en pausa también quedan retenidas', async () => {
    const temporary = await world.openTemporary(ana, 4, 30, 'Carlos');
    const other = await world.pc(5);
    activeSession(await login(other, 'juan'));
    await other.request({ type: 'pause', requestId: 'pause-1' });
    const held = [
      (await revoke(4)).json<PcRevokeResponse>().heldSessionId,
      (await revoke(5)).json<PcRevokeResponse>().heldSessionId,
    ];
    expect(held[0]).toBe(temporary.session.id);
    expect(held[1]).not.toBeNull();
    expect(await db().select().from(sessionHolds)).toHaveLength(2);
  });

  it('REQ-003-11: repetir la petición con el mismo ID devuelve lo mismo y revoca una sola vez', async () => {
    const pc = await world.pc(4);
    activeSession(await login(pc, 'juan'));
    const id = newId();
    const first = await revoke(4, id);
    const second = await revoke(4, id);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(await eventsOf('pc.credential_revoked')).toHaveLength(1);
    expect(await db().select().from(sessionHolds)).toHaveLength(1);
    // Ese ID en otra PC es un conflicto.
    await world.pc(5);
    const conflict = await revoke(5, id);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ code: 'idempotency_conflict' });
  });

  it('REQ-003-11: una PC sin credencial vigente no se puede revocar otra vez', async () => {
    await world.pc(4);
    await revoke(4);
    const again = await revoke(4);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ code: 'pc_not_registered' });
    const unknown = await world.api('POST', '/pcs/' + newId() + '/revoke', ana, { id: newId() });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({ code: 'unknown_pc' });
  });

  it('REQ-003-11: no se revoca con un mantenimiento abierto ni con una orden en curso', async () => {
    const pc = await world.pc(4);
    pc.autoLock = false;
    const { context } = (await world.api('GET', '/pcs/' + devPcId(4) + '/control', ana)).json<{
      context: { kind: string; revision: string };
    }>();
    await world.api('POST', '/pcs/' + devPcId(4) + '/commands', ana, {
      id: newId(),
      kind: 'restart',
      expected: context,
    });
    const busy = await revoke(4);
    expect(busy.statusCode).toBe(409);
    expect(busy.json()).toMatchObject({ code: 'pc_unavailable' });
    expect(await db().select().from(sessionHolds)).toEqual([]);
    const [credential] = await db()
      .select()
      .from(pcCredentials)
      .where(eq(pcCredentials.pcId, devPcId(4)));
    expect(credential?.revokedAt).toBeNull();

    const other = await world.pc(5);
    const { context: free } = (
      await world.api('GET', '/pcs/' + devPcId(5) + '/control', ana)
    ).json<{ context: { kind: string; revision: string } }>();
    const started = await world.api('POST', '/pcs/' + devPcId(5) + '/commands', ana, {
      id: newId(),
      kind: 'startMaintenance',
      expected: free,
    });
    const command = started.json<{
      command: { id: string; action: { maintenanceId: string } };
    }>().command;
    await other.request({ type: 'listCombos', requestId: 'sync' });
    other.send({
      type: 'commandAck',
      commandId: command.id,
      occurredAt: world.clock.now().toISOString(),
      result: {
        status: 'applied',
        effect: {
          kind: 'startMaintenance',
          maintenanceId: command.action.maintenanceId,
          startedAt: world.clock.now().toISOString(),
        },
      },
    });
    await other.request({ type: 'listCombos', requestId: 'sync' });
    const inMaintenance = await revoke(5);
    expect(inMaintenance.statusCode).toBe(409);
    expect(inMaintenance.json()).toMatchObject({ code: 'pc_unavailable' });
  });

  it('ADR-0021: encargado y administrador revocan; el dueño y quien no tiene sesión, no', async () => {
    await world.pc(4);
    await world.pc(5);
    const owner = await loginAsStaff(world.testApp, 'eva', 'dueno', 'Eva');
    expect((await revoke(4, newId(), owner)).statusCode).toBe(403);
    expect((await revoke(4, newId(), null)).statusCode).toBe(401);
    expect((await world.api('POST', revokePath(4), ana, {})).statusCode).toBe(400);
    const admin = await loginAsStaff(world.testApp, 'luis', 'administrador', 'Luis');
    expect((await revoke(4, newId(), admin)).statusCode).toBe(200);
    expect((await revoke(5)).statusCode).toBe(200);
    expect(await eventsOf('pc.credential_revoked')).toMatchObject([
      { actor: { name: 'Luis' } },
      { actor: { name: 'Ana' } },
    ]);
  });
});
