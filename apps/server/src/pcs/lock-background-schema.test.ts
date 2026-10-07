import {
  MAX_BACKGROUND_BYTES,
  MAX_BACKGROUND_HEIGHT,
  MAX_BACKGROUND_WIDTH,
  newId,
} from '@pope/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseHandle } from '../db/database.js';
import { lockScreenBackground, products, settings, staff } from '../db/schema.js';
import { migrateTestDatabase } from '../testing/database.js';
import { createDatabaseBeforeMigration } from '../testing/migrations.js';

const NOW = new Date('2026-10-07T17:00:00Z');
const NEXT = new Date('2026-10-07T17:01:00Z');
const image = {
  sha256: 'a'.repeat(64),
  size: MAX_BACKGROUND_BYTES,
  mimeType: 'image/webp' as const,
  width: MAX_BACKGROUND_WIDTH,
  height: MAX_BACKGROUND_HEIGHT,
};

describe('metadatos del fondo global (spec 003, T06)', () => {
  let handle: DatabaseHandle;
  let actor: NonNullable<typeof lockScreenBackground.$inferInsert.changedBy>;
  beforeEach(async () => {
    handle = await createDatabaseBeforeMigration('0028_lock_screen_background');
    const staffId = newId();
    actor = { kind: 'staff', staffId, name: 'Ana' };
    await handle.db.insert(staff).values({
      id: staffId,
      username: 'ana',
      displayName: 'Ana',
      role: 'administrador',
      passwordHash: 'fixture',
    });
    await handle.db
      .insert(settings)
      .values({ key: 'localName', value: 'Local anterior', updatedAt: NOW, updatedBy: actor });
    await handle.db.insert(products).values({
      id: newId(),
      name: 'Agua',
      priceMicros: 1_000_000,
      photo: 'fixture.webp',
      createdAt: NOW,
    });
    await migrateTestDatabase(handle);
  });
  afterEach(async () => {
    await handle.close();
  });
  const changed = () => ({ revision: 1, ...image, changedAt: NOW, changedBy: actor });

  it('REQ-003-70, REQ-003-71: upgrade inicia un único fondo por defecto y conserva datos', async () => {
    expect(await handle.db.select().from(lockScreenBackground)).toEqual([
      {
        id: 1,
        revision: 0,
        sha256: null,
        size: null,
        mimeType: null,
        width: null,
        height: null,
        changedAt: null,
        changedBy: null,
      },
    ]);
    await expect(handle.db.insert(lockScreenBackground).values({ id: 1 })).rejects.toThrow();
    await expect(handle.db.insert(lockScreenBackground).values({ id: 2 })).rejects.toThrow();
    expect((await handle.db.select().from(settings))[0]?.value).toBe('Local anterior');
    expect((await handle.db.select().from(products))[0]?.photo).toBe('fixture.webp');
  });

  it('REQ-003-71: guarda metadatos al límite y quitar conserva revisión, UTC y autoría', async () => {
    await handle.db
      .update(lockScreenBackground)
      .set(changed())
      .where(eq(lockScreenBackground.id, 1));
    expect((await handle.db.select().from(lockScreenBackground))[0]).toEqual({
      id: 1,
      ...changed(),
    });
    await handle.db.update(lockScreenBackground).set({
      revision: 2,
      sha256: null,
      size: null,
      mimeType: null,
      width: null,
      height: null,
      changedAt: NEXT,
      changedBy: actor,
    });
    expect((await handle.db.select().from(lockScreenBackground))[0]).toMatchObject({
      revision: 2,
      sha256: null,
      changedAt: NEXT,
      changedBy: actor,
    });
  });

  it('REQ-003-70, REQ-003-71: rechaza metadatos parciales, fuera de límites o sin autoría', async () => {
    for (const over of [
      { sha256: 'A'.repeat(64) },
      { sha256: 'a'.repeat(63) },
      { size: 0 },
      { size: MAX_BACKGROUND_BYTES + 1 },
      { size: null },
      { width: 0 },
      { width: MAX_BACKGROUND_WIDTH + 1 },
      { height: MAX_BACKGROUND_HEIGHT + 1 },
      { height: null },
      { mimeType: 'image/png' as 'image/webp' },
      { sha256: null },
      { revision: 0 },
      { revision: -1 },
      { revision: Number.MAX_SAFE_INTEGER + 1 },
      { changedAt: null },
      { changedBy: null },
      { changedBy: { kind: 'system' } as unknown as typeof actor },
    ]) {
      await expect(
        handle.db.update(lockScreenBackground).set({ ...changed(), ...over }),
      ).rejects.toThrow();
    }
    // Tampoco admite campos de imagen sueltos en el valor inicial sin huella.
    await expect(handle.db.update(lockScreenBackground).set({ size: 1 })).rejects.toThrow();
  });

  it('REQ-003-71: reaplicar migraciones no sobrescribe el fondo ni la revisión actual', async () => {
    await handle.db.update(lockScreenBackground).set(changed());
    await migrateTestDatabase(handle);
    expect((await handle.db.select().from(lockScreenBackground))[0]).toEqual({
      id: 1,
      ...changed(),
    });
  });
});
