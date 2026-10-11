import { randomBytes } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pcCredentials, staff } from '../db/schema.js';
import { createTestApp, type TestApp } from '../testing/app.js';
import { loginAsStaff } from '../testing/auth.js';
import { PcAuthenticationService, type AuthenticatedPc } from './pc-authentication.service.js';
import { PcRegistrationService } from './pc-registration.service.js';

describe('T13a: identidad de PC desde cabecera', () => {
  let node: TestApp;
  let auth: PcAuthenticationService;
  let credential: string;
  let identity: AuthenticatedPc;
  beforeAll(async () => {
    node = await createTestApp();
    await loginAsStaff(node, 'pc-auth', 'encargado');
    const [member] = await node.database.db.select().from(staff);
    if (!member) throw new Error('Fixture del personal ausente');
    const registration = node.app.get(PcRegistrationService);
    const code = await registration.issue(
      {},
      { kind: 'staff', staffId: member.id, name: member.displayName },
    );
    const result = await registration.register({
      installationCode: code.code,
      macAddress: 'AA:BB:CC:DD:EE:FF',
    });
    credential = result.credential;
    auth = node.app.get(PcAuthenticationService);
    const authenticated = await auth.authenticate(`Bearer ${credential}`);
    if (!authenticated.ok) throw new Error('Fixture de PC no autenticada');
    identity = authenticated.identity;
    expect(identity.pc).toEqual({ id: result.pc.id, name: result.pc.name });
  });
  afterAll(async () => node.close());

  it('REQ-003-11/63: ausencia, formato y credencial desconocida se rechazan sin devolver secretos', async () => {
    for (const header of [
      undefined,
      '',
      `bearer ${credential}`,
      `Bearer ${credential}=`,
      `Bearer ${randomBytes(32).toString('base64url')}`,
    ]) {
      const result = await auth.authenticate(header);
      expect(result).toMatchObject({ ok: false });
      expect(JSON.stringify(result)).not.toContain(credential);
    }
  });

  it('REQ-003-11/63: identidad ordinaria sin secreto/hash y revisión contra la misma PC', async () => {
    expect(Object.keys(identity).sort()).toEqual(['credentialId', 'pc']);
    expect(await auth.current(identity)).toBe(true);
    expect(
      await auth.current({
        ...identity,
        pc: { id: '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a99', name: 'Falsa' },
      }),
    ).toBe(false);
  });

  it('REQ-003-11: hash revocado se rechaza al conectar y en admisión ya obtenida', async () => {
    await node.database.db
      .update(pcCredentials)
      .set({ revokedAt: new Date() })
      .where(eq(pcCredentials.id, identity.credentialId));
    expect(await auth.authenticate(`Bearer ${credential}`)).toMatchObject({
      ok: false,
      error: { code: 'pc_credential_revoked' },
    });
    expect(await auth.current(identity)).toBe(false);
  });
});
