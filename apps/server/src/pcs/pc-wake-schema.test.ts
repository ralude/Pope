import {
  domainEventSchema,
  newId,
  pcWakeErrorSchema,
  pcWakeResponseSchema,
  PC_WAKE_TIMEOUT_SECONDS,
} from '@pope/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseHandle } from '../db/database.js';
import { pcControlStates, pcs } from '../db/schema.js';
import { createTestDatabase } from '../testing/database.js';

const NOW = new Date('2026-10-22T22:00:00Z');

describe('encendido por Wake-on-LAN persistido (spec 003, T33a)', () => {
  let handle: DatabaseHandle;
  let pcId: string;
  beforeEach(async () => {
    handle = await createTestDatabase();
    pcId = newId();
    await handle.db.insert(pcs).values({ id: pcId, name: 'PC 07' });
    await handle.db.insert(pcControlStates).values({ pcId, revision: newId() });
  });
  afterEach(async () => {
    await handle.close();
  });

  it('REQ-003-22: la petición de encendido va completa o no va', async () => {
    await expect(
      handle.db
        .update(pcControlStates)
        .set({ wakeRequestId: newId() })
        .where(eq(pcControlStates.pcId, pcId)),
    ).rejects.toThrow();
    await expect(
      handle.db
        .update(pcControlStates)
        .set({ wakeRequestedAt: NOW })
        .where(eq(pcControlStates.pcId, pcId)),
    ).rejects.toThrow();
    const requestId = newId();
    await handle.db
      .update(pcControlStates)
      .set({ wakeRequestId: requestId, wakeRequestedAt: NOW })
      .where(eq(pcControlStates.pcId, pcId));
    await handle.db
      .update(pcControlStates)
      .set({ wakeRequestId: null, wakeRequestedAt: null })
      .where(eq(pcControlStates.pcId, pcId));
    const [row] = await handle.db.select().from(pcControlStates);
    expect(row?.wakeRequestId).toBeNull();
  });

  it('REQ-003-22: el contrato es estricto y el evento lleva MAC y plazo', () => {
    const wake = {
      requestId: newId(),
      requestedAt: NOW.toISOString(),
      deadline: new Date(NOW.getTime() + PC_WAKE_TIMEOUT_SECONDS * 1000).toISOString(),
    };
    expect(pcWakeResponseSchema.safeParse({ pcId, wake }).success).toBe(true);
    expect(pcWakeResponseSchema.safeParse({ pcId, wake: { ...wake, extra: 1 } }).success).toBe(
      false,
    );
    expect(pcWakeErrorSchema.safeParse({ code: 'wake_failed', message: 'x' }).success).toBe(true);
    expect(pcWakeErrorSchema.safeParse({ code: 'otro', message: 'x' }).success).toBe(false);
    const event = {
      id: newId(),
      type: 'pc.wake_requested',
      version: 1,
      actor: { kind: 'staff', staffId: newId(), name: 'Ana' },
      occurredAt: NOW.toISOString(),
      payload: {
        requestId: wake.requestId,
        pc: { id: pcId, name: 'PC 07' },
        macAddress: 'AA:BB:CC:DD:EE:FF',
        deadline: wake.deadline,
      },
    };
    expect(domainEventSchema.safeParse(event).success).toBe(true);
    expect(
      domainEventSchema.safeParse({ ...event, payload: { ...event.payload, macAddress: 'x' } })
        .success,
    ).toBe(false);
    expect(domainEventSchema.safeParse({ ...event, actor: { kind: 'system' } }).success).toBe(
      false,
    );
  });
});
