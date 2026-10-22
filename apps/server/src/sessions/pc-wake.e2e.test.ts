import { type DomainEvent, newId, type PcMap, type PcWakeResponse } from '@pope/shared';
import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events, pcs } from '../db/schema.js';
import { devPcId } from '../pcs/dev-pcs.js';
import { loginAsStaff } from '../testing/auth.js';
import { PcWorld } from '../testing/pc-world.js';

// 18:00 en Caracas de un lunes.
const MONDAY = '2026-09-28T22:00:00Z';
const MAC = 'AA:BB:CC:DD:EE:FF';

describe('encender PCs por Wake-on-LAN (e2e, REQ-003-22, CA-003-06, T33)', () => {
  let world: PcWorld;
  let ana: string;

  beforeEach(async () => {
    world = await PcWorld.start(MONDAY);
    ana = await loginAsStaff(world.testApp, 'ana', 'encargado', 'Ana');
    await setMac(7, MAC);
  });

  afterEach(async () => {
    await world.close();
  });

  const db = () => world.testApp.database.db;

  async function setMac(n: number, mac: string | null) {
    await db()
      .update(pcs)
      .set({ macAddress: mac })
      .where(eq(pcs.id, devPcId(n)));
  }

  const wake = (n: number, id = newId(), cookie: string | null = ana) =>
    world.api('POST', `/pcs/${devPcId(n)}/wake`, cookie, { id });

  async function mapOf(n: number) {
    const map = (await world.api('GET', '/pcs/map', ana)).json<PcMap>();
    return map.pcs.find((pc) => pc.id === devPcId(n));
  }

  async function eventsOf(type: DomainEvent['type']) {
    return (await db().select().from(events).orderBy(asc(events.seq))).filter(
      (e) => e.type === type,
    );
  }

  it('CA-003-06: con la PC apagada envía el paquete, audita a Ana y el mapa lo muestra', async () => {
    const response = await wake(7);
    expect(response.statusCode).toBe(200);
    const body = response.json<PcWakeResponse>();
    expect(world.testApp.wake.sent).toEqual([MAC]);
    expect(Date.parse(body.wake.deadline) - Date.parse(body.wake.requestedAt)).toBe(120_000);
    const [event] = await eventsOf('pc.wake_requested');
    expect(event).toMatchObject({
      actor: { kind: 'staff', name: 'Ana' },
      payload: { requestId: body.wake.requestId, macAddress: MAC, pc: { name: 'PC 07' } },
    });
    expect((await mapOf(7))?.wake).toEqual(body.wake);
    expect((await mapOf(7))?.connected).toBe(false);
  });

  it('REQ-003-22: el mismo ID no reenvía el paquete; otro ID sí y renueva los 2 min', async () => {
    const id = newId();
    const first = (await wake(7, id)).json<PcWakeResponse>();
    world.clock.advance(60_000);
    expect((await wake(7, id)).json<PcWakeResponse>()).toEqual(first);
    expect(world.testApp.wake.sent).toHaveLength(1);
    const again = (await wake(7)).json<PcWakeResponse>();
    expect(world.testApp.wake.sent).toHaveLength(2);
    expect(Date.parse(again.wake.requestedAt)).toBe(Date.parse(first.wake.requestedAt) + 60_000);
    expect((await mapOf(7))?.wake).toEqual(again.wake);
    expect(await eventsOf('pc.wake_requested')).toHaveLength(2);
  });

  it('REQ-003-22: el ID de otra PC es un conflicto', async () => {
    await setMac(8, MAC);
    const id = newId();
    await wake(7, id);
    const response = await wake(8, id);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'idempotency_conflict' });
    expect(world.testApp.wake.sent).toHaveLength(1);
  });

  it('REQ-003-22: una PC ya conectada o sin MAC se rechaza sin enviar nada', async () => {
    await world.pc(7);
    // Conectar una PC registra a todas con una MAC de pruebas: la 8 se queda sin ella.
    await setMac(8, null);
    const connected = await wake(7);
    expect(connected.statusCode).toBe(409);
    expect(connected.json()).toMatchObject({ code: 'pc_connected' });
    const noMac = await wake(8);
    expect(noMac.statusCode).toBe(409);
    expect(noMac.json()).toMatchObject({ code: 'mac_unknown' });
    expect((await world.api('POST', `/pcs/${newId()}/wake`, ana, { id: newId() })).statusCode).toBe(
      404,
    );
    expect(world.testApp.wake.sent).toEqual([]);
    expect(await eventsOf('pc.wake_requested')).toEqual([]);
  });

  it('REQ-003-20: el dueño y quien no tiene sesión no pueden encender', async () => {
    const owner = await loginAsStaff(world.testApp, 'eva', 'dueno', 'Eva');
    expect((await wake(7, newId(), owner)).statusCode).toBe(403);
    expect((await wake(7, newId(), null)).statusCode).toBe(401);
    expect((await world.api('POST', `/pcs/${devPcId(7)}/wake`, ana, {})).statusCode).toBe(400);
    expect(world.testApp.wake.sent).toEqual([]);
  });

  it('REQ-003-22: si el envío falla no queda aviso ni evento', async () => {
    world.testApp.wake.fail = true;
    const response = await wake(7);
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ code: 'wake_failed' });
    expect((await mapOf(7))?.wake).toBeNull();
    expect(await eventsOf('pc.wake_requested')).toEqual([]);
  });

  it('CA-003-06: al conectar la PC el aviso desaparece, también si llega tarde', async () => {
    await wake(7);
    const pc = await world.pc(7);
    expect(await mapOf(7)).toMatchObject({ connected: true, wake: null });
    pc.close();

    const late = (await wake(8)).json<PcWakeResponse>();
    world.clock.advance(5 * 60_000);
    expect(Date.parse(late.wake.deadline)).toBeLessThan(world.clock.now().getTime());
    expect((await mapOf(8))?.wake).toEqual(late.wake);
    await world.pc(8);
    expect((await mapOf(8))?.wake).toBeNull();
  });
});
