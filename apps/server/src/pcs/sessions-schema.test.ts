import { newId, usd } from '@pope/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseHandle } from '../db/database.js';
import { customers, pcs, sessions } from '../db/schema.js';
import { createTestDatabase } from '../testing/database.js';
import { DEV_PC_COUNT, devPcId, seedDevPcs } from './dev-pcs.js';

const SYSTEM = { kind: 'system' } as const;

describe('tablas de PCs y sesiones (REQ-001-21)', () => {
  let handle: DatabaseHandle;
  let juan: string;

  beforeEach(async () => {
    handle = await createTestDatabase();
    await seedDevPcs(handle.db);
    juan = newId();
    await handle.db.insert(customers).values({ id: juan, username: 'juan', passwordHash: 'x' });
  });

  afterEach(async () => {
    await handle.close();
  });

  const now = new Date('2026-09-28T18:00:00Z');

  function accountSession(pc: number, customerId = juan) {
    return {
      id: newId(),
      pcId: devPcId(pc),
      kind: 'account' as const,
      customerId,
      rateMicrosPerHour: usd(1.5),
      startedAt: now,
      lastHeartbeatAt: now,
      openedBy: SYSTEM,
    };
  }

  function temporarySession(pc: number) {
    return {
      id: newId(),
      pcId: devPcId(pc),
      kind: 'temporary' as const,
      tempName: 'Carlos',
      purchasedSeconds: 3600,
      rateMicrosPerHour: usd(1.5),
      startedAt: now,
      lastHeartbeatAt: now,
      openedBy: SYSTEM,
    };
  }

  const endSession = (id: string) =>
    handle.db
      .update(sessions)
      .set({ status: 'ended', endedAt: now, endReason: 'customer' })
      .where(eq(sessions.id, id));

  it('las PCs de ejemplo se crean una sola vez, con ids fijos', async () => {
    expect(await seedDevPcs(handle.db)).toBe(0);
    const all = await handle.db.select().from(pcs);
    expect(all).toHaveLength(DEV_PC_COUNT);
    expect(all.find((pc) => pc.id === devPcId(5))?.name).toBe('PC 05');
  });

  it('una cuenta no puede tener dos sesiones activas, aunque sea en otra PC', async () => {
    const first = accountSession(3);
    await handle.db.insert(sessions).values(first);
    await expect(handle.db.insert(sessions).values(accountSession(7))).rejects.toThrow();
    await endSession(first.id);
    await handle.db.insert(sessions).values(accountSession(7));
  });

  it('una PC no puede tener dos sesiones activas', async () => {
    await handle.db.insert(sessions).values(temporarySession(5));
    await expect(handle.db.insert(sessions).values(temporarySession(5))).rejects.toThrow();
  });

  it('una sesión interrumpida solo se restaura una vez', async () => {
    const original = temporarySession(5);
    await handle.db.insert(sessions).values(original);
    await endSession(original.id);
    const restored = { ...temporarySession(2), restoredFrom: original.id };
    await handle.db.insert(sessions).values(restored);
    await endSession(restored.id);
    await expect(
      handle.db.insert(sessions).values({ ...temporarySession(3), restoredFrom: original.id }),
    ).rejects.toThrow();
  });

  it('exige los campos de cada tipo y de una sesión cerrada', async () => {
    await expect(
      handle.db.insert(sessions).values({ ...accountSession(1), customerId: null }),
    ).rejects.toThrow();
    await expect(
      handle.db.insert(sessions).values({ ...temporarySession(1), purchasedSeconds: null }),
    ).rejects.toThrow();
    await expect(
      handle.db.insert(sessions).values({ ...temporarySession(1), status: 'ended' }),
    ).rejects.toThrow();
  });
});
