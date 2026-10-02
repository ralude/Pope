import { Inject, Injectable } from '@nestjs/common';
import {
  type CustomerBalances,
  liveBalances,
  micros,
  type PcMap,
  type PcMapItem,
  type PcMapSession,
  seconds,
  SECONDS_PER_MINUTE,
} from '@pope/shared';
import { asc, eq, inArray, sql } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { customerBalances, customers, pcs, sessions, sessionTopups } from '../db/schema.js';
import { PcConnections } from './pc-connections.js';
import {
  accountBalances,
  actorName,
  remainingSeconds,
  type SessionRow,
  usageOf,
} from './session-state.js';

/**
 * Estado de todas las PCs para el mapa del panel (T38a, REQ-001-31): si están conectadas y
 * su sesión activa resumida. Solo lee: el cobro lo hacen los latidos (`SessionsService`).
 */
@Injectable()
export class PcMapService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly connections: PcConnections,
    private readonly clock: Clock,
  ) {}

  async snapshot(): Promise<PcMap> {
    const [pcRows, active] = await Promise.all([
      this.db.select().from(pcs).orderBy(asc(pcs.name)),
      this.db
        .select({ session: sessions, username: customers.username, balances: customerBalances })
        .from(sessions)
        .leftJoin(customers, eq(customers.id, sessions.customerId))
        .leftJoin(customerBalances, eq(customerBalances.customerId, sessions.customerId))
        .where(eq(sessions.status, 'active')),
    ]);
    const temporaryIds = active
      .filter(({ session }) => session.kind === 'temporary')
      .map(({ session }) => session.id);
    const charged = new Map<string, number>();
    if (temporaryIds.length > 0) {
      const rows = await this.db
        .select({
          sessionId: sessionTopups.sessionId,
          total: sql<string>`sum(${sessionTopups.amountMicros})`,
        })
        .from(sessionTopups)
        .where(inArray(sessionTopups.sessionId, temporaryIds))
        .groupBy(sessionTopups.sessionId);
      for (const row of rows) {
        charged.set(row.sessionId, Number(row.total));
      }
    }

    const byPc = new Map<string, PcMapSession>();
    for (const { session, username, balances } of active) {
      const cached: CustomerBalances = {
        moneyMicros: micros(balances?.moneyMicros ?? 0),
        comboSeconds: balances?.comboSeconds ?? 0,
      };
      byPc.set(session.pcId, summarize(session, username, cached, charged.get(session.id) ?? 0));
    }

    const items: PcMapItem[] = pcRows.map((pc) => ({
      id: pc.id,
      name: pc.name,
      row: pc.mapRow,
      col: pc.mapCol,
      connected: this.connections.isConnected(pc.id),
      session: byPc.get(pc.id) ?? null,
    }));
    return { pcs: items, at: this.clock.now().toISOString() };
  }
}

/** Con 5 min o menos se avisa al cliente (REQ-001-24); el mapa lo marca en rojo. */
const ENDING_SECONDS = 5 * SECONDS_PER_MINUTE;

/** La sesión activa de una PC, resumida para el mapa. */
function summarize(
  row: SessionRow,
  username: string | null,
  balances: CustomerBalances,
  chargedMicros: number,
): PcMapSession {
  const isAccount = row.kind === 'account';
  const remaining = remainingSeconds(row, isAccount ? balances : null);
  const live = isAccount ? liveBalances(usageOf(row), accountBalances(balances)) : null;
  return {
    sessionId: row.id,
    kind: row.kind,
    customerId: isAccount ? row.customerId : null,
    who: isAccount ? (username ?? '') : (row.tempName ?? ''),
    openedBy: actorName(row.openedBy),
    startedAt: row.startedAt.toISOString(),
    remainingSeconds: seconds(remaining),
    billedUntil: row.lastHeartbeatAt.toISOString(),
    rateMicrosPerHour: micros(row.rateMicrosPerHour),
    amountMicros: micros(live ? Math.max(0, live.moneyMicros) : chargedMicros),
    comboSeconds: seconds(live ? Math.max(0, live.comboSeconds) : 0),
    ending: remaining <= ENDING_SECONDS,
  };
}
