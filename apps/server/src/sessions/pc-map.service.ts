import { Inject, Injectable } from '@nestjs/common';
import {
  type CustomerBalances,
  liveBalances,
  micros,
  type PcMap,
  type PcMapItem,
  type PcMapSession,
  type PausesUsed,
  seconds,
  SECONDS_PER_MINUTE,
} from '@pope/shared';
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import {
  customerBalances,
  customers,
  pcCommands,
  pcControlStates,
  pcCredentials,
  pcMaintenances,
  pcs,
  sessionHolds,
  sessions,
  sessionTopups,
} from '../db/schema.js';
import { pausesOfSessions } from './pause-queries.js';
import { PcConnections } from './pc-connections.js';
import { wakeOf } from './pc-wake.service.js';
import {
  accountBalances,
  actorName,
  pauseView,
  type PauseRow,
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

    const pauses = await pausesOfSessions(
      this.db,
      active.flatMap(({ session }) =>
        session.customerId ? [{ sessionId: session.id, customerId: session.customerId }] : [],
      ),
      this.clock.now(),
    );

    const byPc = new Map<string, PcMapSession>();
    for (const { session, username, balances } of active) {
      const cached: CustomerBalances = {
        moneyMicros: micros(balances?.moneyMicros ?? 0),
        comboSeconds: balances?.comboSeconds ?? 0,
      };
      byPc.set(
        session.pcId,
        summarize(
          session,
          username,
          cached,
          charged.get(session.id) ?? 0,
          pauses.get(session.id) ?? null,
        ),
      );
    }

    const wakes = await this.db
      .select({
        pcId: pcControlStates.pcId,
        id: pcControlStates.wakeRequestId,
        at: pcControlStates.wakeRequestedAt,
      })
      .from(pcControlStates)
      .where(isNotNull(pcControlStates.wakeRequestId));
    const wakeByPc = new Map(
      wakes.flatMap(({ pcId, id, at }) => (id && at ? [[pcId, wakeOf(id, at)] as const] : [])),
    );

    const maintenances = await this.db
      .select()
      .from(pcMaintenances)
      .where(isNull(pcMaintenances.endedAt));
    const maintenanceByPc = new Map(
      maintenances.map((row) => [
        row.pcId,
        {
          id: row.id,
          actorName: actorName(row.actor),
          source: row.source,
          startedAt: row.startedAt.toISOString(),
        },
      ]),
    );
    // La orden que reserva la PC solo cuenta mientras puede producir su efecto: pedida y sin
    // vencer, o aceptada a la espera de él.
    const now = this.clock.now();
    const orders = await this.db
      .select({
        pcId: pcCommands.pcId,
        id: pcCommands.id,
        action: pcCommands.action,
        status: pcCommands.status,
        expiresAt: pcCommands.expiresAt,
      })
      .from(pcControlStates)
      .innerJoin(pcCommands, eq(pcCommands.id, pcControlStates.reservedCommandId))
      .where(and(isNotNull(pcControlStates.reservedCommandId)));
    const orderByPc = new Map(
      orders
        .filter(
          (row) => row.status === 'accepted' || (row.status === 'requested' && row.expiresAt > now),
        )
        .map((row) => [row.pcId, { id: row.id, kind: row.action.kind, status: row.status }]),
    );

    // Sesiones retenidas por revocación y si su PC ya tiene una credencial vigente posterior.
    const holds = await this.db
      .select({
        pcId: sessionHolds.pcId,
        sessionId: sessionHolds.sessionId,
        startedAt: sessionHolds.startedAt,
        startedBy: sessionHolds.startedBy,
      })
      .from(sessionHolds)
      .where(isNull(sessionHolds.endedAt));
    const credentials = await this.db
      .select({ pcId: pcCredentials.pcId })
      .from(pcCredentials)
      .where(isNull(pcCredentials.revokedAt));
    const holdByPc = new Map(
      holds.map((hold) => [
        hold.pcId,
        {
          sessionId: hold.sessionId,
          since: hold.startedAt.toISOString(),
          byName: actorName(hold.startedBy),
          // Con la retención abierta la credencial anterior está revocada: una vigente es la nueva.
          relinked: credentials.some((credential) => credential.pcId === hold.pcId),
        },
      ]),
    );

    const items: PcMapItem[] = pcRows.map((pc) => ({
      id: pc.id,
      name: pc.name,
      row: pc.mapRow,
      col: pc.mapCol,
      connected: this.connections.isConnected(pc.id),
      session: byPc.get(pc.id) ?? null,
      wake: wakeByPc.get(pc.id) ?? null,
      maintenance: maintenanceByPc.get(pc.id) ?? null,
      canWake: pc.macAddress !== null,
      hold: holdByPc.get(pc.id) ?? null,
      order: orderByPc.get(pc.id) ?? null,
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
  /** Su pausa abierta y las pausas usadas; `null` en una temporal (spec 002). */
  pause: { open: PauseRow | null; used: PausesUsed } | null,
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
    pause: pauseView(pause?.open ?? null),
    pausesUsed: pause?.used ?? null,
  };
}
