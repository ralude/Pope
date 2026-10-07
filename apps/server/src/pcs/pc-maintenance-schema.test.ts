import { newId } from '@pope/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseHandle } from '../db/database.js';
import {
  pcMaintenances,
  pcs,
  staff,
  staffSessions,
  staffTechnicalLoginAttempts,
} from '../db/schema.js';
import { migrateTestDatabase } from '../testing/database.js';
import { createDatabaseBeforeMigration } from '../testing/migrations.js';

const NOW = new Date('2026-10-07T16:00:00Z');
const UNTIL = new Date('2026-10-07T16:01:00Z');

describe('mantenimiento e intentos técnicos persistidos (spec 003, T05b)', () => {
  let handle: DatabaseHandle;
  let pcId: string;
  let staffId: string;
  let cookieId: string;
  beforeEach(async () => {
    handle = await createDatabaseBeforeMigration('0027_pc_maintenance');
    pcId = newId();
    staffId = newId();
    cookieId = newId();
    await handle.db.insert(pcs).values({ id: pcId, name: 'PC 01' });
    await handle.db.insert(staff).values({
      id: staffId,
      username: 'ana',
      displayName: 'Ana',
      role: 'encargado',
      passwordHash: 'fixture',
    });
    await handle.db.insert(staffSessions).values({
      id: cookieId,
      staffId,
      tokenHash: 'fixture-cookie',
      createdAt: NOW,
      expiresAt: UNTIL,
    });
    await migrateTestDatabase(handle);
  });
  afterEach(async () => {
    await handle.close();
  });
  const entry = (over: Partial<typeof pcMaintenances.$inferInsert> = {}) => ({
    id: newId(),
    pcId,
    pcName: 'PC 01',
    actor: { kind: 'staff' as const, staffId, name: 'Ana' },
    source: 'local' as const,
    startedAt: NOW,
    ...over,
  });
  const exit = () => ({
    exitId: newId(),
    endedAt: UNTIL,
    durationSeconds: 60,
    endedBy: { kind: 'staff' as const, staffId, name: 'Ana' },
    exitSource: 'local' as const,
  });

  it('REQ-003-41, REQ-003-45: upgrade conserva cookies y no inventa entradas ni fallos', async () => {
    expect(await handle.db.select().from(pcMaintenances)).toEqual([]);
    expect(await handle.db.select().from(staffTechnicalLoginAttempts)).toEqual([]);
    expect((await handle.db.select().from(staffSessions))[0]).toMatchObject({
      id: cookieId,
      tokenHash: 'fixture-cookie',
      createdAt: NOW,
    });
    expect((await handle.db.select().from(pcs))[0]?.name).toBe('PC 01');
  });

  it('REQ-003-41, REQ-003-43: una entrada abierta por PC incluso con concurrencia', async () => {
    const results = await Promise.allSettled([
      handle.db.insert(pcMaintenances).values(entry()),
      handle.db.insert(pcMaintenances).values(entry({ source: 'panel' })),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const [first] = await handle.db.select().from(pcMaintenances);
    expect(first?.startedAt).toEqual(NOW);
    await handle.db.update(pcMaintenances).set(exit()).where(eq(pcMaintenances.pcId, pcId));
    await handle.db.insert(pcMaintenances).values(entry());
    expect(await handle.db.select().from(pcMaintenances)).toHaveLength(2);
  });

  it('REQ-003-41: rechaza actor/origen inválidos y salidas incompletas o no enteras', async () => {
    for (const over of [
      { pcName: '' },
      { actor: { kind: 'system' } as unknown as typeof pcMaintenances.$inferInsert.actor },
      { source: 'invalid' as 'local' },
      { exitId: newId() },
      { endedAt: UNTIL },
      { ...exit(), durationSeconds: -1 },
      { ...exit(), durationSeconds: 1.5 },
      { ...exit(), exitSource: 'invalid' as 'local' },
    ]) {
      await expect(handle.db.insert(pcMaintenances).values(entry(over))).rejects.toThrow();
    }
    await handle.db.insert(pcMaintenances).values(entry({ ...exit(), durationSeconds: 0 }));
  });

  it('REQ-003-44: salida concurrente una sola vez e ID no reutilizable', async () => {
    const first = entry();
    const value = exit();
    await handle.db.insert(pcMaintenances).values(first);
    const close = () =>
      handle.db
        .update(pcMaintenances)
        .set(value)
        .where(and(eq(pcMaintenances.id, first.id), isNull(pcMaintenances.endedAt)))
        .returning({ id: pcMaintenances.exitId });
    const results = await Promise.all([close(), close()]);
    expect(results.map((rows) => rows.length).sort()).toEqual([0, 1]);
    await expect(handle.db.insert(pcMaintenances).values(entry(value))).rejects.toThrow();
    expect((await handle.db.select().from(pcMaintenances))[0]).toMatchObject({
      exitId: value.exitId,
      endedAt: UNTIL,
      durationSeconds: 60,
      endedBy: first.actor,
    });
  });

  it('REQ-003-45: contador por cuenta y bloqueo de exactamente 60 s solo al décimo fallo', async () => {
    const base = { staffId };
    for (const over of [
      { failedLogins: -1 },
      { failedLogins: 11 },
      { failedLogins: 1.5 },
      { failedLogins: 10 },
      { failedLogins: 9, lockedAt: NOW, lockedUntil: UNTIL },
      { failedLogins: 10, lockedAt: NOW },
      { failedLogins: 10, lockedAt: NOW, lockedUntil: NOW },
    ]) {
      await expect(
        handle.db.insert(staffTechnicalLoginAttempts).values({ ...base, ...over }),
      ).rejects.toThrow();
    }
    await handle.db.insert(staffTechnicalLoginAttempts).values(base);
    await expect(handle.db.insert(staffTechnicalLoginAttempts).values(base)).rejects.toThrow();
    await handle.db.update(staffTechnicalLoginAttempts).set({ failedLogins: 9 });
    await handle.db
      .update(staffTechnicalLoginAttempts)
      .set({ failedLogins: 10, lockedAt: NOW, lockedUntil: UNTIL });
    expect((await handle.db.select().from(staffTechnicalLoginAttempts))[0]).toMatchObject({
      staffId,
      failedLogins: 10,
      lockedAt: NOW,
      lockedUntil: UNTIL,
    });
    // El reset se hará por el servicio tras éxito o vencimiento, no por la migración.
    await handle.db
      .update(staffTechnicalLoginAttempts)
      .set({ failedLogins: 0, lockedAt: null, lockedUntil: null });
    expect((await handle.db.select().from(staffTechnicalLoginAttempts))[0]?.failedLogins).toBe(0);
    expect((await handle.db.select().from(staffSessions))[0]?.tokenHash).toBe('fixture-cookie');
  });
});
