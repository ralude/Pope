// REQ-003-10/11/63 y REQ-002-30: nodo y CLI reales, sin efectos nativos.
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterEach, expect, it } from 'vitest';
import {
  readProfile,
  registerSimulator,
  simulatorPcOptions,
  simulatorConnector,
} from '../../../../tools/agent-sim/src/registration.js';
import { type PcEvent, SimulatedPc } from '../../../../tools/agent-sim/src/simulated-pc.js';
import { PcRegistrationService } from '../pcs/pc-registration.service.js';
import { createTestApp } from './app.js';
import { FakeClock } from './clock.js';
import { createCustomerWithBalance } from './customers.js';
import { createStaffService } from './staff.js';
import { createTlsFixture } from './tls.js';

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Tiempo de espera excedido');
    await sleep(20);
  }
}

it('T14 · registro CLI, TLS, login, latidos, pausa, reconexión y PC falsa sin secretos en salida', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pope-sim-node-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const tls = await createTlsFixture();
  cleanup.push(() => tls.close());
  const otherTls = await createTlsFixture();
  cleanup.push(() => otherTls.close());
  const clock = new FakeClock('2026-09-28T22:00:00Z');
  const node = await createTestApp('local', [], {
    clock,
    tls: { certFile: tls.certFile, keyFile: tls.keyFile },
  });
  cleanup.push(() => node.close());
  await node.app.listen(0, '127.0.0.1');
  const address = new URL(await node.app.getUrl());
  address.protocol = 'https:';
  const url = address.origin;
  const staff = await createStaffService(node.database).create(
    {
      username: 'sim-registro',
      displayName: 'Prueba simulador',
      role: 'encargado',
      password: 'clave de prueba',
    },
    { kind: 'system' },
  );
  const code = await node.app
    .get(PcRegistrationService)
    .issue({}, { kind: 'staff', staffId: staff.id, name: staff.displayName });
  const codeFile = join(directory, 'pc.installation-code.txt');
  const profileFile = join(directory, 'profile.sim-secret.json');
  await writeFile(codeFile, code.code);
  const options = { url, number: 1, codeFile, profileFile, macAddress: '02:00:00:00:00:01' };

  // Rechazo de identidad TLS sin consumir el código que después usa la CLI.
  await expect(registerSimulator(options)).rejects.toThrow('no válido');
  await expect(registerSimulator({ ...options, caFile: otherTls.certFile })).rejects.toThrow(
    'no válido',
  );
  const cli = await promisify(execFile)(
    process.execPath,
    [
      fileURLToPath(new URL('../../../../tools/agent-sim/dist/cli.js', import.meta.url)),
      'register',
      '--url',
      url,
      '--number',
      '1',
      '--mac',
      options.macAddress,
      '--code-file',
      codeFile,
      '--profile',
      profileFile,
      '--ca-file',
      tls.certFile,
    ],
    { timeout: 15_000 },
  );
  const profile = await readProfile(profileFile);
  const identity = profile.pcs[0];
  if (!identity) throw new Error('No se registró la PC');
  expect(identity.pc.name).toBe('PC 01');
  expect((cli.stdout + cli.stderr).includes(code.code)).toBe(false);
  expect((cli.stdout + cli.stderr).includes(identity.credential)).toBe(false);

  // La misma confianza explícita se comprueba también en WSS, antes del hello.
  const wrongTls = simulatorConnector(profile, identity, otherTls.cert)();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      wrongTls.terminate();
      reject(new Error('Sin rechazo TLS'));
    }, 5000);
    wrongTls.once('error', () => {
      clearTimeout(timer);
      resolve();
    });
    wrongTls.once('open', () => {
      clearTimeout(timer);
      wrongTls.close();
      reject(new Error('CA ajena aceptada'));
    });
  });

  await createCustomerWithBalance(node, 'simreal', { moneyMicros: 3_000_000 });
  const received: PcEvent[] = [];
  const pc = new SimulatedPc({
    ...simulatorPcOptions(profile, 1, tls.cert),
    heartbeatMs: 100,
    onEvent: (event) => {
      received.push(event);
    },
  });
  cleanup.push(async () => {
    pc.stop();
    await sleep(50);
  });
  pc.start();
  await waitFor(() =>
    received.some(
      (e) => e.kind === 'message' && e.message.type === 'state' && e.message.status === 'locked',
    ),
  );
  expect((await pc.login('simreal', '1234')).ok).toBe(true);
  const sessionId = pc.snapshot().sessionId;
  clock.advance(1000);
  await waitFor(() => pc.snapshot().localRemainingSeconds === 7199);

  pc.pause();
  await waitFor(() => pc.snapshot().pause !== null);
  expect(pc.snapshot().pause?.billing).toBe(false);
  const remaining = pc.snapshot().localRemainingSeconds;
  pc.networkCut(0.2);
  await waitFor(() => pc.snapshot().connected);
  await sleep(200);
  expect(pc.snapshot().sessionId).toBe(sessionId);
  expect(pc.snapshot().localRemainingSeconds).toBe(remaining);
  pc.resume();
  await waitFor(() => pc.snapshot().pause === null);

  const falseIdentity = { ...identity, credential: randomBytes(32).toString('base64url') };
  const fake = simulatorConnector(profile, falseIdentity, tls.cert)();
  const status = await new Promise<number | undefined>((resolve, reject) => {
    fake.on('unexpected-response', (_request, response) => {
      response.resume();
      fake.terminate();
      resolve(response.statusCode);
    });
    fake.on('error', () => {
      /* Rechazo HTTP: cerrar también puede emitir error. */
    });
    const timer = setTimeout(() => {
      fake.terminate();
      reject(new Error('Sin rechazo'));
    }, 5000);
    fake.on('close', () => {
      clearTimeout(timer);
    });
  });
  expect(status).toBe(401);
  pc.logout();
  await waitFor(() => pc.snapshot().sessionId === null);
}, 30_000);
