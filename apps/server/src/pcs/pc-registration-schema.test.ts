import { newId } from '@pope/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseHandle } from '../db/database.js';
import { pcCredentials, pcInstallationCodes, pcs, staff } from '../db/schema.js';
import { createTestDatabase, migrateTestDatabase } from '../testing/database.js';
import { createDatabaseBeforeMigration } from '../testing/migrations.js';

const NOW = new Date('2026-10-04T20:00:00Z');
const EXPIRES = new Date('2026-10-04T20:10:00Z');
const CONSUMED = new Date('2026-10-04T20:00:01Z');
// Hashes sintéticos de fixtures; nunca se emiten credenciales reales en estos tests.
const hash = () => newId().replaceAll('-', '').repeat(2);

describe('registro persistido de PC (spec 003, T04)', () => {
  let handle: DatabaseHandle;
  let closer: DatabaseHandle | undefined;
  let pcId: string;
  let staffId: string;

  beforeEach(async () => {
    handle = await createTestDatabase();
    closer = handle;
    pcId = newId();
    staffId = newId();
    await handle.db.insert(pcs).values({ id: pcId, name: 'PC 01' });
    await handle.db.insert(staff).values({
      id: staffId,
      username: 'ana',
      displayName: 'Ana',
      role: 'administrador',
      passwordHash: 'fixture',
    });
  });
  afterEach(async () => {
    await closer?.close();
    closer = undefined;
  });
  const code = (over: Partial<typeof pcInstallationCodes.$inferInsert> = {}) => ({
    id: newId(),
    codeHash: hash(),
    createdByStaffId: staffId,
    createdAt: NOW,
    expiresAt: EXPIRES,
    ...over,
  });
  const consumedCode = async () => {
    const value = code({ consumedAt: CONSUMED, consumedPcId: pcId });
    await handle.db.insert(pcInstallationCodes).values(value);
    return value.id;
  };

  it('REQ-003-11: upgrade conserva identidad/mapa sin autenticar PCs antiguas', async () => {
    await handle.close();
    closer = undefined;
    handle = await createDatabaseBeforeMigration('0025_pc_registration');
    closer = handle;
    await handle.db.execute(sql`insert into pcs (id, name, map_row, map_col, created_at)
      values (${pcId}, 'PC antigua', 1, 2, ${NOW.toISOString()})`);
    await migrateTestDatabase(handle);
    expect(await handle.db.select().from(pcs)).toEqual([
      {
        id: pcId,
        name: 'PC antigua',
        mapRow: 1,
        mapCol: 2,
        createdAt: NOW,
        macAddress: null,
      },
    ]);
    expect(await handle.db.select().from(pcCredentials)).toEqual([]);
  });

  it('REQ-003-22: MAC canónica unicast no nula; las antiguas admiten null', async () => {
    for (const macAddress of ['aa:bb:cc:dd:ee:ff', '00:00:00:00:00:00', 'FF:FF:FF:FF:FF:FF']) {
      await expect(
        handle.db.update(pcs).set({ macAddress }).where(eq(pcs.id, pcId)),
      ).rejects.toThrow();
    }
    await handle.db.update(pcs).set({ macAddress: 'AA:BB:CC:DD:EE:FF' }).where(eq(pcs.id, pcId));
  });

  it('REQ-003-10: hash único, 600 s exactos y consumo completo antes de caducar', async () => {
    const first = code();
    await handle.db.insert(pcInstallationCodes).values(first);
    for (const over of [
      { codeHash: first.codeHash },
      { codeHash: 'secreto-en-claro' },
      { expiresAt: NOW },
      { consumedAt: CONSUMED },
      { consumedPcId: pcId },
      { consumedAt: EXPIRES, consumedPcId: pcId },
    ]) {
      await expect(handle.db.insert(pcInstallationCodes).values(code(over))).rejects.toThrow();
    }
    const otherPc = newId();
    await handle.db.insert(pcs).values({ id: otherPc, name: 'PC 02' });
    await expect(
      handle.db
        .insert(pcInstallationCodes)
        .values(code({ targetPcId: otherPc, consumedAt: CONSUMED, consumedPcId: pcId })),
    ).rejects.toThrow();
  });

  it('REQ-003-10: dos consumos concurrentes solo actualizan una fila una vez', async () => {
    const value = code({ targetPcId: pcId });
    await handle.db.insert(pcInstallationCodes).values(value);
    const consume = () =>
      handle.db
        .update(pcInstallationCodes)
        .set({ consumedAt: CONSUMED, consumedPcId: pcId })
        .where(and(eq(pcInstallationCodes.id, value.id), isNull(pcInstallationCodes.consumedAt)))
        .returning({ id: pcInstallationCodes.id });
    const results = await Promise.all([consume(), consume()]);
    expect(results.map((rows) => rows.length).sort()).toEqual([0, 1]);
  });

  it('REQ-003-11: credencial exige código consumido para la misma PC', async () => {
    const unused = code();
    await handle.db.insert(pcInstallationCodes).values(unused);
    const credential = {
      id: newId(),
      pcId,
      installationCodeId: unused.id,
      credentialHash: hash(),
      createdAt: CONSUMED,
    };
    await expect(handle.db.insert(pcCredentials).values(credential)).rejects.toThrow();
    const usedId = await consumedCode();
    const otherPc = newId();
    await handle.db.insert(pcs).values({ id: otherPc, name: 'PC 02' });
    await expect(
      handle.db
        .insert(pcCredentials)
        .values({ ...credential, pcId: otherPc, installationCodeId: usedId }),
    ).rejects.toThrow();
    await expect(
      handle.db
        .insert(pcCredentials)
        .values({ ...credential, installationCodeId: usedId, credentialHash: 'texto' }),
    ).rejects.toThrow();
  });

  it('REQ-003-11: una vigente por PC; revocar permite reemplazo sin duplicar PC', async () => {
    const first = {
      id: newId(),
      pcId,
      installationCodeId: await consumedCode(),
      credentialHash: hash(),
      createdAt: CONSUMED,
    };
    await handle.db.insert(pcCredentials).values(first);
    const second = {
      ...first,
      id: newId(),
      installationCodeId: await consumedCode(),
      credentialHash: hash(),
    };
    await expect(handle.db.insert(pcCredentials).values(second)).rejects.toThrow();
    await expect(
      handle.db
        .update(pcCredentials)
        .set({ revokedByStaffId: staffId })
        .where(eq(pcCredentials.id, first.id)),
    ).rejects.toThrow();
    await handle.db
      .update(pcCredentials)
      .set({ revokedAt: CONSUMED, revokedByStaffId: staffId })
      .where(eq(pcCredentials.id, first.id));
    await expect(
      handle.db.insert(pcCredentials).values({ ...second, credentialHash: first.credentialHash }),
    ).rejects.toThrow();
    await handle.db.insert(pcCredentials).values(second);
    expect(await handle.db.select().from(pcs)).toHaveLength(1);
    expect(
      await handle.db.select().from(pcCredentials).where(isNull(pcCredentials.revokedAt)),
    ).toHaveLength(1);
  });
});
