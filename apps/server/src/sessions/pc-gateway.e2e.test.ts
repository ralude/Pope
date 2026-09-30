import { PROTOCOL_VERSION } from '@pope/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { devPcId, seedDevPcs } from '../pcs/dev-pcs.js';
import { createTestApp, type TestApp } from '../testing/app.js';
import { listenForPcs, PcTestClient } from '../testing/pc-client.js';
import { PcConnections } from './pc-connections.js';

describe('canal WebSocket de las PCs (e2e, plan 001 "Contratos", ADR-0003)', () => {
  let testApp: TestApp;
  let url: string;
  const clients: PcTestClient[] = [];

  beforeEach(async () => {
    testApp = await createTestApp('local');
    await seedDevPcs(testApp.database.db);
    url = await listenForPcs(testApp);
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.close();
    }
    await testApp.close();
  });

  async function connect(): Promise<PcTestClient> {
    const client = await PcTestClient.connect(url);
    clients.push(client);
    return client;
  }

  async function hello(pcNumber: number) {
    const result = await PcTestClient.hello(url, devPcId(pcNumber));
    clients.push(result.pc);
    return result;
  }

  it('una PC se conecta con hello y recibe state bloqueado', async () => {
    const { state } = await hello(5);
    expect(state).toEqual({ type: 'state', status: 'locked' });
    expect(testApp.app.get(PcConnections).isConnected(devPcId(5))).toBe(true);
  });

  it('un mensaje no válido recibe error con su requestId', async () => {
    const { pc } = await hello(5);
    expect(await pc.request({ type: 'login', username: '', requestId: 'r-7' })).toEqual({
      type: 'error',
      code: 'invalid_message',
      message: 'Mensaje no válido',
      requestId: 'r-7',
    });
    pc.send('esto no es JSON');
    expect(await pc.next()).toMatchObject({ type: 'error', code: 'invalid_message' });
  });

  it('antes de hello solo se acepta hello', async () => {
    const pc = await connect();
    expect(await pc.request({ type: 'logout', requestId: 'r-1' })).toEqual({
      type: 'error',
      code: 'invalid_message',
      message: 'La PC debe identificarse antes',
      requestId: 'r-1',
    });
  });

  it('una PC desconocida recibe unknown_pc y se cierra la conexión', async () => {
    const pc = await connect();
    pc.send({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      pcId: '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a99',
      sessionId: null,
    });
    expect(await pc.next()).toMatchObject({ type: 'error', code: 'unknown_pc' });
    expect((await pc.closed).code).toBe(1008);
  });

  it('una segunda conexión de la misma PC reemplaza a la anterior', async () => {
    const first = await hello(5);
    await hello(5);
    expect((await first.pc.closed).code).toBe(4000);
    expect(testApp.app.get(PcConnections).isConnected(devPcId(5))).toBe(true);
  });

  it('al desconectarse, la PC deja de figurar como conectada', async () => {
    const { pc } = await hello(5);
    pc.close();
    await pc.closed;
    // La baja se procesa en la cola de la conexión, justo después del cierre.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(testApp.app.get(PcConnections).isConnected(devPcId(5))).toBe(false);
  });

  it('el latido sin sesión recibe state bloqueado', async () => {
    const { pc } = await hello(5);
    expect(
      await pc.request({ type: 'heartbeat', sessionId: null, localRemainingSeconds: null }),
    ).toEqual({ type: 'state', status: 'locked' });
  });
});
