import { newId } from '@pope/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseHandle } from '../db/database.js';
import { pcCommands, pcControlStates, pcs, sessions, staff, staffSessions } from '../db/schema.js';
import { migrateTestDatabase } from '../testing/database.js';
import { createDatabaseBeforeMigration } from '../testing/migrations.js';

const NOW = new Date('2026-10-05T22:00:00Z');
const UNTIL = new Date('2026-10-05T22:00:30Z');

describe('órdenes y reservas persistidas (spec 003, T05a)', () => {
  let handle: DatabaseHandle;
  let pcId: string;
  let staffId: string;
  let cookieId: string;
  let sessionId: string;
  beforeEach(async () => {
    handle = await createDatabaseBeforeMigration('0026_pc_control');
    pcId = newId();
    await handle.db.insert(pcs).values({ id: pcId, name: 'PC 01' });
    staffId = newId();
    cookieId = newId();
    sessionId = newId();
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
    await handle.db.insert(sessions).values({
      id: sessionId,
      pcId,
      kind: 'temporary',
      tempName: 'Anterior',
      purchasedSeconds: 60,
      rateMicrosPerHour: 1_000_000,
      startedAt: NOW,
      lastHeartbeatAt: NOW,
      openedBy: { kind: 'staff', staffId, name: 'Ana' },
    });
    await migrateTestDatabase(handle);
  });
  afterEach(async () => {
    await handle.close();
  });
  const command = (over: Partial<typeof pcCommands.$inferInsert> = {}) => {
    const id = newId();
    const expected = { kind: 'free' as const, revision: newId() };
    return {
      id,
      pcId,
      actor: { kind: 'staff' as const, staffId, name: 'Ana' },
      request: { id, kind: 'lock' as const, expected },
      expected,
      action: { kind: 'lock' as const },
      issuedAt: NOW,
      expiresAt: UNTIL,
      ...over,
    };
  };

  it('REQ-003-20: upgrade conserva PC y no inventa órdenes ni estado Windows', async () => {
    expect((await handle.db.select().from(pcs))[0]?.name).toBe('PC 01');
    expect(await handle.db.select().from(pcCommands)).toEqual([]);
    expect(await handle.db.select().from(pcControlStates)).toEqual([]);
    expect((await handle.db.select().from(staffSessions))[0]).toMatchObject({
      id: cookieId,
      tokenHash: 'fixture-cookie',
      createdAt: NOW,
    });
    expect((await handle.db.select().from(sessions))[0]).toMatchObject({
      id: sessionId,
      status: 'active',
      purchasedSeconds: 60,
      startedAt: NOW,
    });
  });
  it('REQ-003-20: ID único, 30 s exactos y resultado completo', async () => {
    const first = command();
    await handle.db.insert(pcCommands).values(first);
    await expect(handle.db.insert(pcCommands).values(first)).rejects.toThrow();
    for (const over of [
      { expiresAt: NOW },
      { status: 'applied' as const },
      { lastResultAt: NOW },
      { lastResult: { status: 'accepted' as const, kind: 'lock' as const } },
      {
        status: 'applied' as const,
        action: { kind: 'restart' as const },
        lastResultAt: NOW,
        lastResult: { status: 'applied' as const, effect: { kind: 'lock' as const } },
      },
    ])
      await expect(handle.db.insert(pcCommands).values(command(over))).rejects.toThrow();
    const accepted = command({
      action: { kind: 'restart' },
      status: 'accepted',
      lastResultAt: NOW,
      lastResult: { status: 'accepted', kind: 'restart' },
    });
    await handle.db.insert(pcCommands).values(accepted);
    expect(
      (await handle.db.select().from(pcCommands).where(eq(pcCommands.id, accepted.id)))[0]
        ?.issuedAt,
    ).toEqual(NOW);
  });
  it('REQ-003-43: reserva completa y ligada a la misma PC', async () => {
    const first = command();
    await handle.db.insert(pcCommands).values(first);
    const otherPc = newId();
    await handle.db.insert(pcs).values({ id: otherPc, name: 'PC 02' });
    for (const value of [
      { pcId, revision: newId(), reservedCommandId: first.id },
      { pcId: otherPc, revision: newId(), reservedCommandId: first.id, reservedAt: NOW },
    ])
      await expect(handle.db.insert(pcControlStates).values(value)).rejects.toThrow();
    await handle.db
      .insert(pcControlStates)
      .values({ pcId, revision: newId(), reservedCommandId: first.id, reservedAt: NOW });
    await expect(
      handle.db.insert(pcControlStates).values({ pcId, revision: newId() }),
    ).rejects.toThrow();
  });
  it('REQ-003-20, REQ-003-43: dos reservas concurrentes solo ganan una vez', async () => {
    const first = command();
    const orders = [first, command()];
    await handle.db.insert(pcCommands).values(orders);
    await handle.db.insert(pcControlStates).values({ pcId, revision: newId() });
    const results = await Promise.all(
      orders.map((order) =>
        handle.db
          .update(pcControlStates)
          .set({ reservedCommandId: order.id, reservedAt: NOW })
          .where(and(eq(pcControlStates.pcId, pcId), isNull(pcControlStates.reservedCommandId)))
          .returning({ id: pcControlStates.reservedCommandId }),
      ),
    );
    expect(results.map((rows) => rows.length).sort()).toEqual([0, 1]);
    const [reserved] = await handle.db.select().from(pcControlStates);
    expect(reserved?.reservedCommandId).toBeTruthy();
    await handle.db
      .update(pcCommands)
      .set({ status: 'expired' })
      .where(eq(pcCommands.id, reserved?.reservedCommandId ?? ''));
    const [state] = await handle.db.select().from(pcControlStates);
    expect(state?.reservedCommandId).toBe(reserved?.reservedCommandId);
  });
});
