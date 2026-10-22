import {
  newId,
  type PcInstallationCodeResponse,
  type PcMap,
  type PcRegistrationResponse,
  usd,
} from '@pope/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sessionHolds, sessions } from '../db/schema.js';
import { devPcId } from '../pcs/dev-pcs.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { PcTestClient, useCredential } from '../testing/pc-client.js';
import { testPcCredentials } from '../testing/pc-credentials.js';
import { activeSession, login, PcWorld } from '../testing/pc-world.js';

// 18:00 en Caracas de un lunes.
const MONDAY = '2026-09-28T22:00:00Z';
const MAC = 'AA:BB:CC:DD:EE:04';

describe('revincular una PC con la sesión retenida (e2e, REQ-003-11, ADR-0020/0022, T34e)', () => {
  let world: PcWorld;
  let ana: string;

  beforeEach(async () => {
    world = await PcWorld.start(MONDAY);
    ana = await world.cashier();
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    await createCustomerWithBalance(world.testApp, 'maria', { moneyMicros: usd(3) });
  });

  afterEach(async () => {
    await world.close();
  });

  const db = () => world.testApp.database.db;
  const revoke = (n: number) =>
    world.api('POST', `/pcs/${devPcId(n)}/revoke`, ana, { id: newId() });
  const code = (n: number) =>
    world.api('POST', '/pcs/installation-codes', ana, { pcId: devPcId(n) });

  async function mapItem(n: number) {
    const map = (await world.api('GET', '/pcs/map', ana)).json<PcMap>();
    const found = map.pcs.find((pc) => pc.id === devPcId(n));
    if (!found) throw new Error('La PC no está en el mapa');
    return found;
  }

  /** PC 4 con la sesión de juan, ya revocada y retenida. */
  async function held() {
    const pc = await world.pc(4);
    const sessionId = activeSession(await login(pc, 'juan')).sessionId;
    const old = (await testPcCredentials(world.testApp)).get(devPcId(4)) ?? '';
    await revoke(4);
    return { sessionId, old };
  }

  async function relink(installationCode: string) {
    return world.api('POST', '/pcs/register', null, { installationCode, macAddress: MAC });
  }

  it('ADR-0022: el código se emite para una PC con la sesión retenida, y sin retención sigue rechazándose', async () => {
    await held();
    const issued = await code(4);
    expect(issued.statusCode).toBe(201);
    const other = await world.pc(5);
    activeSession(await login(other, 'maria'));
    const refused = await code(5);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ code: 'pc_unavailable' });
  });

  it('REQ-003-11: con el código la PC obtiene una credencial nueva, conecta y sigue retenida', async () => {
    const { sessionId, old } = await held();
    const before = (await db().select().from(sessions).where(eq(sessions.id, sessionId)))[0];
    const issued = (await code(4)).json<PcInstallationCodeResponse>();
    expect((await mapItem(4)).hold).toMatchObject({
      sessionId,
      byName: 'Ana',
      relinked: false,
    });

    const registered = await relink(issued.code);
    expect(registered.statusCode).toBe(201);
    const { credential } = registered.json<PcRegistrationResponse>();
    useCredential(world.url, devPcId(4), credential);
    const { pc, state } = await PcTestClient.hello(world.url, devPcId(4), sessionId);
    expect(state).toEqual({
      type: 'state',
      status: 'held',
      sessionId,
      reason: 'credential_revoked',
    });
    expect(pc).toBeDefined();
    expect((await mapItem(4)).hold).toMatchObject({ relinked: true });
    expect((await mapItem(4)).connected).toBe(true);

    // Nada se cobró ni se cerró; la retención sigue abierta y no se desbloqueó nada.
    const after = (await db().select().from(sessions).where(eq(sessions.id, sessionId)))[0];
    expect(after?.status).toBe('active');
    expect(after?.moneyChargedMicros).toBe(before?.moneyChargedMicros);
    expect((await db().select().from(sessionHolds))[0]?.endedAt).toBeNull();

    // La credencial anterior sigue revocada.
    useCredential(world.url, devPcId(4), old);
    await expect(PcTestClient.hello(world.url, devPcId(4), sessionId)).rejects.toThrow();
  });

  it('REQ-003-11: la PC revinculada no recibe estados activos ni se desbloquea con su heartbeat', async () => {
    const { sessionId } = await held();
    const issued = (await code(4)).json<PcInstallationCodeResponse>();
    const { credential } = (await relink(issued.code)).json<PcRegistrationResponse>();
    useCredential(world.url, devPcId(4), credential);
    const { pc } = await PcTestClient.hello(world.url, devPcId(4), sessionId);
    pc.send({ type: 'heartbeat', sessionId, localRemainingSeconds: 1000 });
    pc.send({ type: 'listCombos', requestId: 'sync' });
    expect(await pc.next()).toMatchObject({ type: 'state', status: 'held' });
    expect(await pc.next()).toMatchObject({ type: 'combos' });
  });

  it('REQ-003-10: el código es de un uso y caduca a los 10 min, como el de instalación', async () => {
    await held();
    const first = (await code(4)).json<PcInstallationCodeResponse>();
    expect((await relink(first.code)).statusCode).toBe(201);
    const reused = await relink(first.code);
    expect(reused.statusCode).toBe(400);
    expect(reused.json()).toMatchObject({ code: 'installation_code_used' });

    const second = (await code(4)).json<PcInstallationCodeResponse>();
    world.clock.advance(601_000);
    const expired = await relink(second.code);
    expect(expired.json()).toMatchObject({ code: 'installation_code_expired' });
  });

  it('REQ-003-11: la recuperación ordinaria de una PC libre no cambia', async () => {
    await world.pc(6);
    const issued = await code(6);
    expect(issued.statusCode).toBe(201);
    const registered = await relink(issued.json<PcInstallationCodeResponse>().code);
    expect(registered.statusCode).toBe(201);
    expect(registered.json<PcRegistrationResponse>().pc.id).toBe(devPcId(6));
  });
});
