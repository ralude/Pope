// Consultas de las retenciones por revocación (spec 003, T34; REQ-003-11).
import { and, eq, isNull } from 'drizzle-orm';

import type { Database } from '../db/database.js';
import { sessionHolds } from '../db/schema.js';
import type { Transaction } from '../events/events.service.js';

export type HoldRow = typeof sessionHolds.$inferSelect;

/** La retención abierta de una sesión, si la tiene: mientras exista, no se cobra ni se cierra. */
export async function openHoldOf(
  sessionId: string,
  db: Database | Transaction,
): Promise<HoldRow | null> {
  const [hold] = await db
    .select()
    .from(sessionHolds)
    .where(and(eq(sessionHolds.sessionId, sessionId), isNull(sessionHolds.endedAt)));
  return hold ?? null;
}
