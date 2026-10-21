import { once } from 'node:events';
import { randomBytes } from 'node:crypto';

import { Logger } from '@nestjs/common';
import {
  devPcId,
  newId,
  nativeNodeToPcMessageSchema,
  pcAuthenticationErrorSchema,
} from '@pope/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { pcCredentials, sessions, staff } from '../db/schema.js';
import { PcRegistrationService } from '../pcs/pc-registration.service.js';
import { seedDevPcs } from '../pcs/dev-pcs.js';
import { createTestApp, type TestApp } from '../testing/app.js';
import { listenForPcs } from '../testing/pc-client.js';
import { testPcCredentials } from '../testing/pc-credentials.js';
import { FakeClock } from '../testing/clock.js';

describe('T13c: admisión real del canal autenticado', () => {
  let node: TestApp;
  let url: string;
  let credentials: Map<string, string>;
  const sockets: WebSocket[] = [];
  const clock = new FakeClock();
  const hello = (pcId = devPcId(1)) => ({
    type: 'hello',
    protocolVersion: 2,
    pcId,
    sessionId: null,
    recoveryState: 'known',
    controlContext: { kind: 'free', revision: newId() },
    pendingMaintenanceExitId: null,
  });

  beforeAll(async () => {
    node = await createTestApp('local', [], { clock });
    await seedDevPcs(node.database.db);
    url = await listenForPcs(node);
    credentials = await testPcCredentials(node);
  });
  afterAll(async () => {
    for (const ws of sockets) ws.terminate();
    await node.close();
  });

  async function open(number = 1): Promise<WebSocket> {
    const ws = new WebSocket(url, {
      headers: { authorization: `Bearer ${credentials.get(devPcId(number)) ?? ''}` },
    });
    sockets.push(ws);
    ws.on('error', () => {
      /* El cierre de seguridad puede producir un error de ws. */
    });
    await once(ws, 'open');
    return ws;
  }

  /**
   * Envía y devuelve la respuesta. Como el agente, aparta `controlState` y las órdenes (T28),
   * que el nodo envía después del `state` y pueden cruzarse con la respuesta siguiente.
   */
  async function request(ws: WebSocket, message: object | string) {
    const response = next(ws);
    ws.send(typeof message === 'string' ? message : JSON.stringify(message));
    return response;
  }

  /** Siguiente mensaje que no sea `controlState` ni una orden. */
  function next(ws: WebSocket) {
    return new Promise<ReturnType<typeof nativeNodeToPcMessageSchema.parse>>((resolve, reject) => {
      const listener = (raw: Buffer) => {
        try {
          const parsed = nativeNodeToPcMessageSchema.parse(JSON.parse(raw.toString('utf8')));
          if (parsed.type === 'controlState' || parsed.type === 'command') return;
          ws.off('message', listener);
          resolve(parsed);
        } catch (error) {
          ws.off('message', listener);
          reject(error instanceof Error ? error : new Error('Mensaje no válido'));
        }
      };
      ws.on('message', listener);
    });
  }

  function denied(authorization?: string, suffix = '') {
    return new Promise<{
      status: number;
      error: ReturnType<typeof pcAuthenticationErrorSchema.parse>;
    }>((resolve, reject) => {
      const ws = new WebSocket(url + suffix, { headers: authorization ? { authorization } : {} });
      sockets.push(ws);
      const timer = setTimeout(() => {
        ws.terminate();
        reject(new Error('La admisión no respondió'));
      }, 3000);
      ws.on('error', () => {
        /* El rechazo HTTP se verifica mediante unexpected-response. */
      });
      ws.once('unexpected-response', (_request, response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          body += chunk;
        });
        response.once('end', () => {
          clearTimeout(timer);
          ws.terminate();
          resolve({
            status: response.statusCode ?? 0,
            error: pcAuthenticationErrorSchema.parse(JSON.parse(body)),
          });
        });
      });
    });
  }

  it('REQ-003-11/63: ausencia, secreto desconocido y secreto en URL se rechazan antes del upgrade', async () => {
    for (const [authorization, suffix, expected] of [
      [undefined, '', 'missing_pc_credential'],
      [`Bearer ${randomBytes(32).toString('base64url')}`, '', 'invalid_pc_credential'],
      [
        `Bearer ${credentials.get(devPcId(1)) ?? ''}`,
        '?credential=secreto',
        'invalid_pc_credential',
      ],
    ] as const) {
      const result = await denied(authorization, suffix);
      expect(result).toMatchObject({ status: 401, error: { code: expected } });
      expect(JSON.stringify(result)).not.toContain('Bearer');
    }
  });

  it('REQ-003-63: v1, identidad ajena y hello repetido no pueden cambiar la identidad', async () => {
    for (const message of [{ ...hello(), protocolVersion: 1 }, hello(devPcId(2))]) {
      const ws = await open();
      const closed = once(ws, 'close');
      expect(await request(ws, message)).toMatchObject({ type: 'pcAuthenticationError' });
      expect((await closed)[0]).toBe(1008);
    }
    const ws = await open();
    expect(await request(ws, hello())).toMatchObject({ type: 'state', status: 'locked' });
    const closed = once(ws, 'close');
    expect(await request(ws, hello())).toMatchObject({ type: 'error', code: 'invalid_message' });
    expect((await closed)[0]).toBe(1008);
  });

  it('REQ-003-11: sustitución de credencial cierra el canal vivo y rechaza reconectar con la anterior', async () => {
    const ws = await open(3);
    await request(ws, hello(devPcId(3)));
    const notification = next(ws);
    const closed = once(ws, 'close');
    const registration = node.app.get(PcRegistrationService);
    const [member] = await node.database.db.select().from(staff);
    if (!member) throw new Error('Personal fixture ausente');
    const code = await registration.issue(
      { pcId: devPcId(3) },
      { kind: 'staff', staffId: member.id, name: member.displayName },
    );
    const recovered = await registration.register({
      installationCode: code.code,
      macAddress: 'AA:BB:CC:DD:EE:FF',
    });
    expect(await notification).toMatchObject({
      type: 'pcAuthenticationError',
      code: 'pc_credential_revoked',
    });
    expect((await closed)[0]).toBe(1008);
    expect(await denied(`Bearer ${credentials.get(devPcId(3)) ?? ''}`)).toMatchObject({
      status: 401,
      error: { code: 'pc_credential_revoked' },
    });
    credentials.set(devPcId(3), recovered.credential);
    const again = await open(3);
    expect(await request(again, hello(devPcId(3)))).toMatchObject({
      type: 'state',
      status: 'locked',
    });
  });

  it('REQ-003-11: revocación posterior al upgrade se comprueba antes del hello', async () => {
    const ws = await open(4);
    await node.database.db
      .update(pcCredentials)
      .set({ revokedAt: clock.now() })
      .where(eq(pcCredentials.pcId, devPcId(4)));
    const closed = once(ws, 'close');
    expect(await request(ws, hello(devPcId(4)))).toMatchObject({
      type: 'pcAuthenticationError',
      code: 'pc_credential_revoked',
    });
    expect((await closed)[0]).toBe(1008);
  });

  it('REQ-003-63: JSON/variantes/campos malformados no se ejecutan ni imprimen secretos', async () => {
    const spies = [
      vi.spyOn(Logger.prototype, 'log'),
      vi.spyOn(Logger.prototype, 'error'),
      vi.spyOn(Logger.prototype, 'warn'),
    ];
    try {
      const ws = await open(5);
      await request(ws, hello(devPcId(5)));
      for (const message of [
        '{',
        { type: 'execute', path: 'cmd.exe' },
        {
          type: 'login',
          username: 'fixture',
          password: 'secreto de login',
          credential: credentials.get(devPcId(5)),
        },
      ]) {
        expect(await request(ws, message)).toMatchObject({
          type: 'error',
          code: 'invalid_message',
        });
      }
      const output = JSON.stringify(spies.map((spy) => spy.mock.calls));
      expect(output).not.toContain(credentials.get(devPcId(5)));
      expect(output).not.toContain('secreto de login');
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it('REQ-003-63: frames binarios/excesivos y cola de entrada excedida cierran sin ejecución', async () => {
    for (const kind of ['binary', 'oversize', 'queue'] as const) {
      const ws = await open(6);
      const closed = once(ws, 'close');
      if (kind === 'binary') ws.send(Buffer.from('texto'));
      else if (kind === 'oversize') ws.send('x'.repeat(16 * 1024 + 1));
      else for (let i = 0; i < 64; i++) ws.send(JSON.stringify({ type: 'listCombos' }));
      expect((await closed)[0]).toBe(kind === 'binary' ? 1003 : kind === 'oversize' ? 1009 : 1008);
    }
  });

  it('REQ-003-04/63: hello con copia desconocida no inventa un reinicio ni cierra la sesión', async () => {
    const sessionId = newId();
    await node.database.db.insert(sessions).values({
      id: sessionId,
      pcId: devPcId(7),
      kind: 'temporary',
      tempName: 'Fixture recuperada',
      rateMicrosPerHour: 1_000_000,
      purchasedSeconds: 600,
      startedAt: clock.now(),
      lastHeartbeatAt: clock.now(),
      pcConfirmedAt: clock.now(),
      openedBy: { kind: 'system' },
    });
    const ws = await open(7);
    expect(
      await request(ws, { ...hello(devPcId(7)), recoveryState: 'unknown', controlContext: null }),
    ).toMatchObject({ type: 'state', status: 'active', session: { sessionId } });
    const [session] = await node.database.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId));
    expect(session?.status).toBe('active');
  });
});
