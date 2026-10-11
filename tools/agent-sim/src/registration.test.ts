import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { nodeUrl, readProfile, registerSimulator, simulatorIdentity } from './registration.js';

const id = '01900000-0000-7000-8000-000000000123';
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

describe('REQ-003-10/11/63 · registro privado del simulador', () => {
  it('solo permite TLS o loopback literal, sin secretos ni parámetros en URL', () => {
    expect(nodeUrl('https://nodo:3000').href).toBe('https://nodo:3000/');
    expect(nodeUrl('http://127.0.0.1:3000').protocol).toBe('http:');
    for (const url of [
      'http://nodo',
      'http://localhost',
      'https://u:secreto@nodo',
      'https://nodo/?credential=secreto',
      'https://nodo/pc',
      'wss://nodo',
    ]) {
      expect(() => nodeUrl(url)).toThrow('no válido');
    }
  });

  async function fixture() {
    const directory = await mkdtemp(join(tmpdir(), 'pope-sim-'));
    cleanup.push(() => rm(directory, { recursive: true, force: true }));
    const credential = randomBytes(32).toString('base64url');
    const codeFile = join(directory, 'pc.installation-code.txt');
    const profileFile = join(directory, 'test.sim-secret.json');
    await writeFile(codeFile, randomBytes(16).toString('base64url'));
    let requests = 0;
    const server = createServer((request, response) => {
      requests++;
      request.resume();
      response.writeHead(201, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          pc: { id, name: 'PC registrada', macAddress: '02:00:00:00:00:01' },
          credential,
          protocolVersion: 2,
        }),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanup.push(
      () =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          }),
        ),
    );
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Sin puerto');
    return {
      codeFile,
      profileFile,
      credential,
      requests: () => requests,
      options: {
        codeFile,
        profileFile,
        url: `http://127.0.0.1:${String(address.port)}`,
        number: 1,
        macAddress: '02:00:00:00:00:01',
      },
    };
  }

  it('persiste identidad devuelta por registro y rechaza sobreescribir el número antes de consumir', async () => {
    const f = await fixture();
    await registerSimulator(f.options);
    const profile = await readProfile(f.profileFile);
    expect(profile.purpose).toBe('simulator');
    expect(simulatorIdentity(profile, 1)).toMatchObject({
      pc: { id, name: 'PC registrada' },
      credential: f.credential,
    });
    const before = await readFile(f.profileFile, 'utf8');
    await expect(registerSimulator(f.options)).rejects.toThrow('no válido');
    expect(f.requests()).toBe(1);
    expect(await readFile(f.profileFile, 'utf8')).toBe(before);
    expect(() => simulatorIdentity(profile, 2)).toThrow('no está registrada');
  });

  it('rechaza configuración de producción/corrupta y campos secretos inesperados sin divulgarlos', async () => {
    const f = await fixture();
    for (const data of [
      'secreto',
      JSON.stringify({ purpose: 'production', credential: f.credential }),
      'x'.repeat(65_537),
    ]) {
      await writeFile(f.profileFile, data);
      await expect(readProfile(f.profileFile)).rejects.toThrow('no válido');
    }
    await expect(readProfile(f.profileFile.replace('.sim-secret.json', '.json'))).rejects.toThrow(
      'no válido',
    );
  });

  it('valida tamaño/código y bloqueo del perfil antes de enviar la petición', async () => {
    const f = await fixture();
    await writeFile(f.codeFile, 'x'.repeat(129));
    await expect(registerSimulator(f.options)).rejects.toThrow('no válido');
    expect(f.requests()).toBe(0);
    await writeFile(f.codeFile, randomBytes(16).toString('base64url'));
    await writeFile(`${f.profileFile}.lock`, '');
    await expect(registerSimulator(f.options)).rejects.toThrow('no válido');
    expect(f.requests()).toBe(0);
  });
});
