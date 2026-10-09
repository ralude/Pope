import { writeFile } from 'node:fs/promises';
import { request } from 'node:https';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { loadConfig } from './config.js';
import { createNodeAdapter, loadNodeTls } from './transport.js';
import { createTlsFixture } from './testing/tls.js';
import { createTestApp, type TestApp } from './testing/app.js';
import { loginAsStaff } from './testing/auth.js';

const base = { POPE_MODE: 'local', HOST: '127.0.0.1', DATABASE_URL: 'postgres://test' };

describe('REQ-003-63: transporte LAN cifrado (ADR-0017)', () => {
  let fixture: Awaited<ReturnType<typeof createTlsFixture>>;
  let foreign: Awaited<ReturnType<typeof createTlsFixture>>;
  let testApp: TestApp;
  let origin: string;
  const cleanup: (() => Promise<void>)[] = [];

  beforeAll(async () => {
    fixture = await createTlsFixture();
    cleanup.push(() => fixture.close());
    foreign = await createTlsFixture();
    cleanup.push(() => foreign.close());
    testApp = await createTestApp('local', [], { tls: fixture });
    cleanup.push(() => testApp.close());
    await testApp.app.listen(0, '127.0.0.1');
    const { port } = testApp.app.getHttpServer().address() as AddressInfo;
    origin = `https://127.0.0.1:${String(port)}`;
  });

  afterAll(async () => {
    for (const close of cleanup.reverse()) await close();
  });

  function get(ca: Buffer, servername?: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = request(`${origin}/health`, { ca, servername, timeout: 3000 }, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          body += chunk;
        });
        response.on('end', () => {
          resolve({ status: response.statusCode ?? 0, body });
        });
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy(new Error('Tiempo TLS agotado'));
      });
      req.end();
    });
  }

  it('REQ-003-63: HTTPS funciona solo en LAN con la identidad confiable y sin nube', async () => {
    const response = await get(fixture.cert);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ mode: 'local' });
    await expect(get(foreign.cert)).rejects.toThrow();
    await expect(get(fixture.cert, 'nodo-ajeno.invalid')).rejects.toThrow();
  });

  it('REQ-003-63: WSS usa el mismo certificado y rechaza el ajeno', async () => {
    const ws = new WebSocket(origin.replace('https:', 'wss:') + '/pc', { ca: fixture.cert });
    try {
      await once(ws, 'open');
      expect(ws.readyState).toBe(WebSocket.OPEN);
    } finally {
      const closed = once(ws, 'close');
      ws.close();
      await closed;
    }
    const impostor = new WebSocket(origin.replace('https:', 'wss:') + '/pc', { ca: foreign.cert });
    await expect(once(impostor, 'open')).rejects.toThrow();
  });

  it('REQ-003-63: TLS no acepta protocolos anteriores a 1.2', async () => {
    const ws = new WebSocket(origin.replace('https:', 'wss:') + '/pc', {
      ca: fixture.cert,
      minVersion: 'TLSv1',
      maxVersion: 'TLSv1.1',
    });
    await expect(once(ws, 'open')).rejects.toThrow();
  });

  it('REQ-003-63: no abre la LAN local sin TLS ni vuelve a HTTP por un fallo', async () => {
    await expect(loadNodeTls(loadConfig({ ...base, HOST: '0.0.0.0' }))).rejects.toThrow(
      /exige TLS/,
    );
    expect(await loadNodeTls(loadConfig(base))).toBeNull();
    const tls = { certFile: fixture.certFile, keyFile: fixture.keyFile };
    const config = { ...loadConfig(base), tls };
    await expect(
      createNodeAdapter({ ...config, tls: { ...tls, certFile: fixture.expiredFile } }),
    ).rejects.toThrow(/TLS no válido/);
    await expect(
      createNodeAdapter({ ...config, tls: { ...tls, keyFile: foreign.keyFile } }),
    ).rejects.toThrow(/TLS no válido/);
    await expect(
      createNodeAdapter({ ...config, tls: { ...tls, certFile: 'no-existe.pem' } }),
    ).rejects.toThrow(/TLS no válido/);
  });

  it('REQ-003-63: PEM corrupto o excesivo falla sin revelar el contenido', async () => {
    await writeFile(foreign.expiredFile, 'contenido privado ficticio');
    const config = {
      ...loadConfig(base),
      tls: { certFile: foreign.expiredFile, keyFile: fixture.keyFile },
    };
    await expect(loadNodeTls(config)).rejects.toThrow(/^TLS no válido:/);
    await writeFile(foreign.expiredFile, Buffer.alloc(65_537));
    await expect(loadNodeTls(config)).rejects.toThrow(/^TLS no válido:/);
  });

  it('REQ-003-63: credenciales correctas/erróneas no aparecen en logs; cookie local Secure', async () => {
    const log = vi.spyOn(Logger.prototype, 'log');
    const error = vi.spyOn(Logger.prototype, 'error');
    const warn = vi.spyOn(Logger.prototype, 'warn');
    try {
      await loginAsStaff(testApp, 'tls-staff', 'encargado', 'Personal TLS');
      const password = 'contraseña TLS privada ficticia';
      const failed = await testApp.app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { username: 'tls-staff', password },
        headers: { authorization: 'Bearer credencial ficticia TLS' },
      });
      expect(failed.statusCode).toBe(401);
      const success = await testApp.app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { username: 'tls-staff', password: 'secreto' },
      });
      expect(success.statusCode).toBe(200);
      expect(success.cookies[0]).toMatchObject({ secure: true, httpOnly: true });
      const output = JSON.stringify([log.mock.calls, error.mock.calls, warn.mock.calls]);
      expect(output).not.toContain(password);
      expect(output).not.toContain('secreto');
      expect(output).not.toContain('credencial ficticia TLS');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('REQ-003-63: configura juntos los PEM y convierte sus rutas a absolutas', () => {
    expect(() => loadConfig({ ...base, POPE_TLS_CERT_FILE: 'cert.pem' })).toThrow(/POPE_TLS/);
    expect(() => loadConfig({ ...base, POPE_TLS_KEY_FILE: 'key.pem' })).toThrow(/POPE_TLS/);
    expect(
      loadConfig({
        ...base,
        POPE_TLS_CERT_FILE: fixture.certFile,
        POPE_TLS_KEY_FILE: fixture.keyFile,
      }).tls,
    ).toEqual({ certFile: fixture.certFile, keyFile: fixture.keyFile });
  });
});
