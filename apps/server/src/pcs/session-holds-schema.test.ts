import { newId } from '@pope/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseHandle } from '../db/database.js';
import {
  pcCredentials,
  pcInstallationCodes,
  pcs,
  sessionHolds,
  sessions,
  staff,
} from '../db/schema.js';
import { createTestDatabase } from '../testing/database.js';

const NOW = new Date('2026-10-22T20:00:00Z');
const LATER = new Date('2026-10-22T20:20:00Z');

describe('sesiones retenidas por revocación persistidas (spec 003, T34b)', () => {
  let handle: DatabaseHandle;
  let pcId: string;
  let staffId: string;
  let sessionId: string;
  let credentialId: string;
  const actor = () => ({ kind: 'staff' as const, staffId, name: 'Ana' });

  beforeEach(async () => {
    handle = await createTestDatabase();
    pcId = newId();
    staffId = newId();
    sessionId = newId();
    credentialId = newId();
    const codeId = newId();
    await handle.db.insert(pcs).values({ id: pcId, name: 'PC 01' });
    await handle.db.insert(staff).values({
      id: staffId,
      username: 'ana',
      displayName: 'Ana',
      role: 'encargado',
      passwordHash: 'fixture',
    });
    await handle.db.insert(pcInstallationCodes).values({
      id: codeId,
      codeHash: 'a'.repeat(64),
      createdByStaffId: staffId,
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 600_000),
      consumedAt: NOW,
      consumedPcId: pcId,
    });
    await handle.db.insert(pcCredentials).values({
      id: credentialId,
      pcId,
      installationCodeId: codeId,
      credentialHash: 'b'.repeat(64),
      createdAt: NOW,
    });
    await handle.db.insert(sessions).values({
      id: sessionId,
      pcId,
      kind: 'temporary',
      tempName: 'Carlos',
      purchasedSeconds: 3600,
      rateMicrosPerHour: 1_000_000,
      startedAt: NOW,
      lastHeartbeatAt: NOW,
      openedBy: actor(),
    });
  });
  afterEach(async () => {
    await handle.close();
  });

  const hold = (over: Partial<typeof sessionHolds.$inferInsert> = {}) => ({
    id: newId(),
    sessionId,
    pcId,
    revokedCredentialId: credentialId,
    startedAt: NOW,
    startedBy: actor(),
    ...over,
  });

  it('REQ-003-11: una retención abierta por sesión; al cerrarla puede abrirse otra', async () => {
    const first = hold();
    await handle.db.insert(sessionHolds).values(first);
    await expect(handle.db.insert(sessionHolds).values(hold())).rejects.toThrow();
    await handle.db
      .update(sessionHolds)
      .set({ endedAt: LATER, endedBy: actor(), endReason: 'continued' })
      .where(eq(sessionHolds.id, first.id));
    await handle.db.insert(sessionHolds).values(hold());
    const open = await handle.db
      .select()
      .from(sessionHolds)
      .where(and(eq(sessionHolds.sessionId, sessionId), isNull(sessionHolds.endedAt)));
    expect(open).toHaveLength(1);
  });

  it('REQ-003-11: el fin va completo, con motivo válido y no antes del inicio', async () => {
    const value = hold();
    await handle.db.insert(sessionHolds).values(value);
    const end = (set: Partial<typeof sessionHolds.$inferInsert>) =>
      handle.db.update(sessionHolds).set(set).where(eq(sessionHolds.id, value.id));
    await expect(end({ endedAt: LATER })).rejects.toThrow();
    await expect(end({ endedAt: LATER, endedBy: actor() })).rejects.toThrow();
    await expect(
      end({ endedAt: LATER, endedBy: actor(), endReason: 'continued' }).then(() =>
        end({ endReason: 'otro' as never }),
      ),
    ).rejects.toThrow();
    await handle.db
      .update(sessionHolds)
      .set({ endedAt: null, endedBy: null, endReason: null })
      .where(eq(sessionHolds.id, value.id));
    await expect(
      end({ endedAt: new Date(NOW.getTime() - 1), endedBy: actor(), endReason: 'session_closed' }),
    ).rejects.toThrow();
    await end({ endedAt: LATER, endedBy: actor(), endReason: 'session_closed' });
  });

  it('REQ-003-11: solo el personal inicia o termina una retención, y debe existir la credencial', async () => {
    await expect(
      handle.db.insert(sessionHolds).values(hold({ startedBy: { kind: 'system' } as never })),
    ).rejects.toThrow();
    await expect(
      handle.db.insert(sessionHolds).values(hold({ revokedCredentialId: newId() })),
    ).rejects.toThrow();
    await expect(handle.db.insert(sessionHolds).values(hold({ pcId: newId() }))).rejects.toThrow();
  });
});
