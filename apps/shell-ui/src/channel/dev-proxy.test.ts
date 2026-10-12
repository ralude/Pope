import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

import { createServer } from 'vite';
import { expect, it } from 'vitest';

import { devProxy } from '../../dev-proxy.js';

it('REQ-003-63: Vite autentica solo upgrades del origen local y publica solo identidad', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pope-dev-proxy-'));
  const credential = 'A'.repeat(43);
  const pc = {
    id: '01900000-0000-7000-8000-000000000001',
    name: 'PC registrada',
    macAddress: 'AA:BB:CC:DD:EE:01',
  };
  const headers: (string | undefined)[] = [];
  const node = createHttpServer();
  node.on('upgrade', (incoming, socket) => {
    headers.push(incoming.headers.authorization);
    const key = incoming.headers['sec-websocket-key'];
    if (typeof key !== 'string') {
      socket.destroy();
      return;
    }
    const accept = createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    socket.end(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
  });
  await new Promise<void>((resolve) => node.listen(0, '127.0.0.1', resolve));
  const path = join(directory, 'fixture.sim-secret.json');
  await writeFile(
    path,
    JSON.stringify({
      purpose: 'simulator',
      version: 1,
      nodeUrl: `http://127.0.0.1:${String((node.address() as AddressInfo).port)}/`,
      caFile: null,
      pcs: [{ number: 1, pc, credential }],
    }),
  );
  const configured = await devProxy(path, '1');
  const server = await createServer({
    configFile: false,
    plugins: [configured.plugin],
    server: { host: '127.0.0.1', port: 0, proxy: configured.proxy },
    logLevel: 'silent',
  });
  try {
    await server.listen();
    const port = (server.httpServer?.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${String(port)}/__pope-dev-identity`);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual(pc);
    expect(body).not.toContain(credential);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await upgrade(port, 'http://127.0.0.1:5174')).toBe(true);
    expect(headers).toEqual([`Bearer ${credential}`]);
    expect(await upgrade(port, 'https://evil.invalid')).toBe(false);
    expect(headers).toHaveLength(1);
    const absent = await devProxy(undefined, undefined);
    expect(absent.proxy).toEqual({});
  } finally {
    await server.close();
    await new Promise<void>((resolve) =>
      node.close(() => {
        resolve();
      }),
    );
    await rm(directory, { recursive: true, force: true });
  }
}, 15_000);

function upgrade(port: number, origin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const outgoing = request({
      hostname: '127.0.0.1',
      port,
      path: '/pc',
      headers: {
        Origin: origin,
        Upgrade: 'websocket',
        Connection: 'Upgrade',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': Buffer.alloc(16).toString('base64'),
      },
    });
    outgoing.setTimeout(2000, () => {
      outgoing.destroy();
      resolve(false);
    });
    outgoing.on('upgrade', (_, socket) => {
      socket.destroy();
      resolve(true);
    });
    outgoing.on('response', (response) => {
      response.resume();
      resolve(false);
    });
    outgoing.on('error', () => {
      resolve(false);
    });
    outgoing.end();
  });
}
