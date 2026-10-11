import { createHash } from 'node:crypto';

import {
  pcInstallationCodeResponseSchema,
  pcRegistrationErrorSchema,
  pcRegistrationResponseSchema,
} from '@pope/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { events, pcCredentials, pcInstallationCodes, pcs } from '../db/schema.js';
import { createTestApp, type TestApp } from '../testing/app.js';
import { loginAsStaff } from '../testing/auth.js';
import { FakeClock } from '../testing/clock.js';

describe('T12: registro de PC por HTTP', () => {
  let node: TestApp;
  let staffCookie: string;
  const clock = new FakeClock();

  beforeAll(async () => {
    node = await createTestApp('local', [], { clock });
    staffCookie = await loginAsStaff(node, 'instalador', 'encargado');
  });
  afterAll(async () => node.close());

  it('REQ-003-10/11: encargado emite y registro público entrega la credencial una sola vez', async () => {
    const issued = await node.app.inject({
      method: 'POST',
      url: '/pcs/installation-codes',
      headers: { cookie: staffCookie },
      payload: {},
    });
    expect(issued.statusCode).toBe(201);
    expect(issued.headers['cache-control']).toBe('no-store');
    const code = pcInstallationCodeResponseSchema.parse(issued.json());
    expect(code.expiresAt).toBe(new Date(clock.now().getTime() + 600_000).toISOString());
    const payload = { installationCode: code.code, macAddress: 'aa-bb-cc-dd-ee-ff' };
    const response = await node.app.inject({ method: 'POST', url: '/pcs/register', payload });
    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const registration = pcRegistrationResponseSchema.parse(response.json());
    expect(registration.pc).toMatchObject({ name: 'PC 01', macAddress: 'AA:BB:CC:DD:EE:FF' });
    const [storedCode] = await node.database.db.select().from(pcInstallationCodes);
    expect(storedCode?.consumedPcId).toBe(registration.pc.id);
    expect(storedCode?.codeHash).toBe(createHash('sha256').update(code.code).digest('hex'));
    const [storedCredential] = await node.database.db.select().from(pcCredentials);
    expect(storedCredential?.credentialHash).toBe(
      createHash('sha256').update(registration.credential).digest('hex'),
    );
    const audit = await node.database.db.select().from(events);
    expect(JSON.stringify(audit)).not.toContain(code.code);
    expect(JSON.stringify(audit)).not.toContain(registration.credential);
    expect(audit.filter((event) => event.type === 'pc.registered')).toHaveLength(1);
    const repeated = await node.app.inject({ method: 'POST', url: '/pcs/register', payload });
    expect(pcRegistrationErrorSchema.parse(repeated.json()).code).toBe('installation_code_used');
    expect(await node.database.db.select().from(pcs)).toHaveLength(1);
  });

  it('REQ-003-10: dueño y petición sin sesión no pueden emitir; administrador sí', async () => {
    const owner = await loginAsStaff(node, 'propietario', 'dueno');
    const admin = await loginAsStaff(node, 'adminregistro', 'administrador');
    for (const [cookie, status] of [
      [owner, 403],
      [undefined, 401],
      [admin, 201],
    ] as const) {
      const response = await node.app.inject({
        method: 'POST',
        url: '/pcs/installation-codes',
        headers: cookie ? { cookie } : {},
        payload: {},
      });
      expect(response.statusCode).toBe(status);
    }
  });

  it('REQ-003-10/11: rechaza datos impuestos y errores no devuelven el secreto', async () => {
    for (const payload of [
      { installationCode: 'secreto', macAddress: 'AA:BB:CC:DD:EE:FF' },
      { installationCode: 'A'.repeat(22), macAddress: '01:BB:CC:DD:EE:FF' },
      { installationCode: 'A'.repeat(22), macAddress: 'AA:BB:CC:DD:EE:FF', pcId: 'impuesto' },
    ]) {
      const response = await node.app.inject({ method: 'POST', url: '/pcs/register', payload });
      expect(response.statusCode).toBe(400);
      expect(pcRegistrationErrorSchema.parse(response.json()).code).toBe('invalid_registration');
      expect(response.body).not.toContain(payload.installationCode);
    }
  });
});
