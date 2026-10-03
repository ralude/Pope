// Consultas de la pausa que comparten las sesiones y la pausa misma (spec 002).
import { type PausesUsed, pausesOnDayOf } from '@pope/shared';
import { and, count, eq, gte, inArray, isNull, or } from 'drizzle-orm';

import type { Database } from '../db/database.js';
import { sessionPauses } from '../db/schema.js';
import type { PauseRow } from './session-state.js';

/** Basta mirar dos días atrás para contar las pausas de un día de Caracas. */
const PAUSES_LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;

/** La pausa abierta de una sesión, si tiene. */
export async function openPauseOf(sessionId: string, db: Database): Promise<PauseRow | null> {
  const [pause] = await db
    .select()
    .from(sessionPauses)
    .where(and(eq(sessionPauses.sessionId, sessionId), isNull(sessionPauses.endedAt)));
  return pause ?? null;
}

/**
 * Pausas ya usadas, contando la que esté en curso: las de la sesión (REQ-002-21) y las de la
 * cuenta en el día de Caracas, en todas sus sesiones (REQ-002-24).
 */
export async function pausesUsed(
  db: Database,
  sessionId: string,
  customerId: string,
  now: Date,
): Promise<PausesUsed> {
  const [inSession] = await db
    .select({ n: count() })
    .from(sessionPauses)
    .where(eq(sessionPauses.sessionId, sessionId));
  const recent = await db
    .select({ startedAt: sessionPauses.startedAt })
    .from(sessionPauses)
    .where(
      and(
        eq(sessionPauses.customerId, customerId),
        gte(sessionPauses.startedAt, new Date(now.getTime() - PAUSES_LOOKBACK_MS)),
      ),
    );
  return {
    inSession: inSession?.n ?? 0,
    today: pausesOnDayOf(
      recent.map((p) => p.startedAt),
      now,
    ),
  };
}

/**
 * Para el mapa del panel (REQ-002-13, REQ-002-14): de cada sesión con cuenta, su pausa
 * abierta y las pausas usadas en la sesión y en el día, con una sola consulta.
 */
export async function pausesOfSessions(
  db: Database,
  active: readonly { sessionId: string; customerId: string }[],
  now: Date,
): Promise<Map<string, { open: PauseRow | null; used: PausesUsed }>> {
  const result = new Map<string, { open: PauseRow | null; used: PausesUsed }>();
  if (active.length === 0) {
    return result;
  }
  const rows = await db
    .select()
    .from(sessionPauses)
    .where(
      or(
        inArray(
          sessionPauses.sessionId,
          active.map((a) => a.sessionId),
        ),
        and(
          inArray(
            sessionPauses.customerId,
            active.map((a) => a.customerId),
          ),
          gte(sessionPauses.startedAt, new Date(now.getTime() - PAUSES_LOOKBACK_MS)),
        ),
      ),
    );
  for (const { sessionId, customerId } of active) {
    const ofSession = rows.filter((p) => p.sessionId === sessionId);
    const ofCustomer = rows.filter((p) => p.customerId === customerId);
    result.set(sessionId, {
      open: ofSession.find((p) => p.endedAt === null) ?? null,
      used: {
        inSession: ofSession.length,
        today: pausesOnDayOf(
          ofCustomer.map((p) => p.startedAt),
          now,
        ),
      },
    });
  }
  return result;
}
