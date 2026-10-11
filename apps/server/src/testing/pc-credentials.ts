import { type Actor } from '@pope/shared';

import { pcs } from '../db/schema.js';
import { seedDevPcs } from '../pcs/dev-pcs.js';
import { PcRegistrationService } from '../pcs/pc-registration.service.js';
import type { TestApp } from './app.js';
import { createStaffService } from './staff.js';

const fixtures = new WeakMap<TestApp, Map<string, string>>();

/** Solo fixtures: registro real T12, hashes aleatorios y ningún secreto fijo de producción. */
export async function testPcCredentials(node: TestApp): Promise<Map<string, string>> {
  const existing = fixtures.get(node);
  if (existing) return existing;
  const member = await createStaffService(node.database).create(
    {
      username: 'pc-fixture',
      displayName: 'Registro de pruebas',
      role: 'encargado',
      password: 'secreto',
    },
    { kind: 'system' },
  );
  const actor: Actor = { kind: 'staff', staffId: member.id, name: member.displayName };
  let rows = await node.database.db.select().from(pcs);
  if (rows.length === 0) {
    await seedDevPcs(node.database.db, 1);
    rows = await node.database.db.select().from(pcs);
  }
  const registration = node.app.get(PcRegistrationService);
  const credentials = new Map<string, string>();
  for (const pc of rows) {
    const code = await registration.issue({ pcId: pc.id }, actor);
    const result = await registration.register({
      installationCode: code.code,
      macAddress: 'AA:BB:CC:DD:EE:FF',
    });
    credentials.set(pc.id, result.credential);
  }
  fixtures.set(node, credentials);
  return credentials;
}
