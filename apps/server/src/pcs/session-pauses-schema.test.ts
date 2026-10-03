import { newId, usd } from '@pope/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseHandle } from '../db/database.js';
import { customers, sessionPauses, sessions } from '../db/schema.js';
import { createTestDatabase } from '../testing/database.js';
import { devPcId, seedDevPcs } from './dev-pcs.js';

const SYSTEM = { kind: 'system' } as const;

describe('tabla de pausas (spec 002, REQ-002-21, REQ-002-24)', () => {
  let handle: DatabaseHandle;
  let juan: string;
  let sessionId: string;

  const now = new Date('2026-10-03T22:00:00Z');
  const in15min = new Date('2026-10-03T22:15:00Z');

  beforeEach(async () => {
    handle = await createTestDatabase();
    await seedDevPcs(handle.db);
    juan = newId();
    await handle.db.insert(customers).values({ id: juan, username: 'juan', passwordHash: 'x' });
    sessionId = newId();
    await handle.db.insert(sessions).values({
      id: sessionId,
      pcId: devPcId(5),
      kind: 'account',
      customerId: juan,
      rateMicrosPerHour: usd(1.5),
      startedAt: now,
      lastHeartbeatAt: now,
      openedBy: SYSTEM,
    });
  });

  afterEach(async () => {
    await handle.close();
  });

  const pause = (over: Partial<typeof sessionPauses.$inferInsert> = {}) => ({
    id: newId(),
    sessionId,
    customerId: juan,
    startedAt: now,
    maxUntil: in15min,
    startedBy: SYSTEM,
    ...over,
  });

  const end = (id: string) =>
    handle.db
      .update(sessionPauses)
      .set({ endedAt: in15min, endReason: 'resumed', endedBy: SYSTEM })
      .where(eq(sessionPauses.id, id));

  it('una sesión no puede tener dos pausas abiertas, pero sí varias ya cerradas', async () => {
    const first = pause();
    await handle.db.insert(sessionPauses).values(first);
    await expect(handle.db.insert(sessionPauses).values(pause())).rejects.toThrow();
    await end(first.id);
    const second = pause();
    await handle.db.insert(sessionPauses).values(second);
    await end(second.id);
    expect(await handle.db.select().from(sessionPauses)).toHaveLength(2);
  });

  it('una pausa cerrada lleva cuándo, por qué y quién; una abierta, nada de eso', async () => {
    await expect(
      handle.db.insert(sessionPauses).values(pause({ endedAt: in15min })),
    ).rejects.toThrow();
    await expect(
      handle.db.insert(sessionPauses).values(pause({ endedAt: in15min, endReason: 'resumed' })),
    ).rejects.toThrow();
    await expect(
      handle.db.insert(sessionPauses).values(pause({ endReason: 'cancelled' as 'resumed' })),
    ).rejects.toThrow();
  });

  it('dura algo, y no se vuelve a cobrar antes de su duración máxima (REQ-002-22)', async () => {
    await expect(
      handle.db.insert(sessionPauses).values(pause({ maxUntil: now })),
    ).rejects.toThrow();
    await expect(
      handle.db.insert(sessionPauses).values(pause({ billingResumedAt: now })),
    ).rejects.toThrow();
    await handle.db.insert(sessionPauses).values(pause({ billingResumedAt: in15min }));
  });
});
