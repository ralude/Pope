import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type Actor,
  type CashShift,
  defaultTemporaryName,
  formatLocalTime,
  interruptionOf,
  MAX_TEMPORARY_SECONDS,
  micros,
  newId,
  RESTORE_WINDOW_MS,
  type TemporaryAddTimeRequest,
  type TemporaryBackup,
  type TemporaryOpenRequest,
  type TemporaryPurchase,
  temporaryPurchase,
  temporaryRemaining,
  type TemporaryRestoreRequest,
  type TemporarySession,
} from '@pope/shared';
import { and, desc, eq, gt, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { pcs, sessions, sessionTopups } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { TariffsService } from '../tariffs/tariffs.service.js';
import { PcConnections } from './pc-connections.js';
import { type SessionRow, temporaryUsageOf } from './session-state.js';
import { SessionsService } from './sessions.service.js';

/**
 * Valida lo que compra un cobro de una sesión temporal: algo de tiempo, sin pasar de 24 h
 * y con un importe de al menos un céntimo (el evento exige un importe positivo).
 */
export function checkPurchase(purchase: TemporaryPurchase): void {
  if (purchase.seconds < 1) {
    throw new BadRequestException('El importe no alcanza para 1 segundo de tiempo');
  }
  if (purchase.seconds > MAX_TEMPORARY_SECONDS) {
    throw new BadRequestException('Como máximo 24 horas por cobro');
  }
  if (purchase.charge < 1) {
    throw new BadRequestException('El importe es demasiado pequeño para cobrarlo');
  }
}

/**
 * Sesiones temporales, sin cuenta (REQ-001-60 a REQ-001-71): las abre el encargado cobrando
 * en caja y la PC se desbloquea al momento. El tiempo comprado se gasta con el mismo
 * checkpoint y los mismos avisos que las sesiones con cuenta (`SessionsService`).
 */
@Injectable()
export class TemporarySessionsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly tariffs: TariffsService,
    private readonly settings: SettingsService,
    private readonly connections: PcConnections,
    private readonly sessions: SessionsService,
    private readonly clock: Clock,
  ) {}

  /**
   * Abre una sesión temporal en una PC libre y conectada (REQ-001-22, REQ-001-60). El
   * cobro, con la tarifa del día (REQ-001-14), queda en el turno de quien cobra y la sesión
   * en su nombre (REQ-001-31). Emite `session.started`.
   */
  async open(
    input: TemporaryOpenRequest,
    shift: CashShift,
    actor: Actor,
  ): Promise<TemporarySession> {
    const row = await this.events.inTransaction(async (tx, emit) => {
      // Bloquea la PC: un login o otra apertura a la vez en ella esperan a que termine.
      const [pc] = await tx.select().from(pcs).where(eq(pcs.id, input.pcId)).for('update');
      if (!pc) {
        throw new NotFoundException('No existe esa PC');
      }
      if (await this.sessions.activeOnPc(pc.id, tx)) {
        throw new ConflictException(`La ${pc.name} ya tiene una sesión abierta`);
      }
      if (!this.connections.isConnected(pc.id)) {
        throw new ConflictException(`La ${pc.name} no está conectada al nodo`);
      }

      const now = this.clock.now();
      const rate = await this.tariffs.rateAt(now, tx);
      const purchase = temporaryPurchase(input, rate);
      checkPurchase(purchase);
      const name = input.name ?? defaultTemporaryName(pc.name, now);

      const [created] = await tx
        .insert(sessions)
        .values({
          id: newId(),
          pcId: pc.id,
          kind: 'temporary',
          tempName: name,
          rateMicrosPerHour: rate,
          startedAt: now,
          lastHeartbeatAt: now,
          openedBy: actor,
          purchasedSeconds: purchase.seconds,
        })
        .returning();
      if (!created) {
        throw new Error('No se pudo abrir la sesión');
      }
      await tx.insert(sessionTopups).values({
        id: newId(),
        sessionId: created.id,
        seconds: purchase.seconds,
        amountMicros: purchase.charge,
        paymentMethod: input.paymentMethod,
        shiftId: shift.id,
        actor,
        createdAt: now,
      });
      emit({
        type: 'session.started',
        version: 1,
        actor,
        payload: {
          kind: 'temporary',
          sessionId: created.id,
          pc: { id: pc.id, name: pc.name },
          name,
          rate: { micros: rate, currency: 'USD' },
          purchasedSeconds: purchase.seconds,
          amount: { micros: purchase.charge, currency: 'USD' },
          paymentMethod: input.paymentMethod,
          shiftId: shift.id,
        },
      });
      return created;
    });
    this.sessions.announce(row);
    const [described] = await this.describe([row]);
    if (!described) {
      throw new Error('No se pudo leer la sesión abierta');
    }
    return described;
  }

  /**
   * Añade tiempo a una sesión temporal en curso, cobrando en caja (REQ-001-70, CA-001-10).
   * Se cobra con la tarifa de la sesión, no con la de hoy, y el cobro queda en el turno de
   * quien cobra. Emite `session.time_added`. La PC ve el nuevo tiempo al momento.
   */
  async addTime(
    sessionId: string,
    input: TemporaryAddTimeRequest,
    shift: CashShift,
    actor: Actor,
  ): Promise<TemporarySession> {
    const row = await this.events.inTransaction(async (tx, emit) => {
      const [locked] = await tx
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .for('update');
      if (!locked) {
        throw new NotFoundException('No existe esa sesión');
      }
      if (locked.kind !== 'temporary') {
        throw new ConflictException('Solo las sesiones temporales admiten añadir tiempo');
      }
      if (locked.status !== 'active') {
        throw new ConflictException('La sesión ya terminó');
      }

      // Primero se cobra lo ya usado: el tiempo nuevo se suma a lo que de verdad queda.
      const { row: current } = await this.sessions.checkpoint(locked, tx);
      const purchase = temporaryPurchase(input, micros(current.rateMicrosPerHour));
      checkPurchase(purchase);
      const [updated] = await tx
        .update(sessions)
        .set({ purchasedSeconds: (current.purchasedSeconds ?? 0) + purchase.seconds })
        .where(eq(sessions.id, current.id))
        .returning();
      if (!updated) {
        throw new Error('No se pudo añadir el tiempo');
      }
      await tx.insert(sessionTopups).values({
        id: newId(),
        sessionId: updated.id,
        seconds: purchase.seconds,
        amountMicros: purchase.charge,
        paymentMethod: input.paymentMethod,
        shiftId: shift.id,
        actor,
        createdAt: this.clock.now(),
      });
      const [pc] = await tx.select({ name: pcs.name }).from(pcs).where(eq(pcs.id, updated.pcId));
      emit({
        type: 'session.time_added',
        version: 1,
        actor,
        payload: {
          sessionId: updated.id,
          pc: { id: updated.pcId, name: pc?.name ?? '' },
          seconds: purchase.seconds,
          amount: { micros: purchase.charge, currency: 'USD' },
          paymentMethod: input.paymentMethod,
          shiftId: shift.id,
        },
      });
      return updated;
    });
    this.sessions.announce(row);
    const [described] = await this.describe([row]);
    if (!described) {
      throw new Error('No se pudo leer la sesión');
    }
    return described;
  }

  /**
   * Restaura una sesión interrumpida por un corte en una PC libre y conectada, la misma u
   * otra (REQ-001-67, CA-001-06). La sesión nueva sigue con el tiempo restante, sin cobrar
   * nada, y queda enlazada a la original; emite `session.restored` con quien la restaura.
   * Solo se puede una vez (REQ-001-68, CA-001-08) y hasta 48 h después del corte
   * (REQ-001-71, CA-001-11). Cada rechazo dice por qué.
   */
  async restore(
    sessionId: string,
    input: TemporaryRestoreRequest,
    actor: Actor,
  ): Promise<TemporarySession> {
    const row = await this.events.inTransaction(async (tx, emit) => {
      // Bloquea la original: dos restauraciones a la vez esperan y la segunda ve la primera.
      const [original] = await tx
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .for('update');
      if (!original) {
        throw new NotFoundException('No existe esa sesión');
      }
      if (original.kind !== 'temporary') {
        throw new ConflictException('Solo se restauran las sesiones temporales');
      }
      if (original.status === 'active') {
        throw new ConflictException('Esa sesión sigue en curso');
      }
      const remaining = temporaryRemaining(temporaryUsageOf(original));
      const [restoring] = await tx
        .select()
        .from(sessions)
        .where(eq(sessions.restoredFrom, original.id));
      const interruption = interruptionOf({
        endReason: original.endReason,
        remainingSeconds: remaining,
        lastBeatAt: original.lastHeartbeatAt,
        restoredBy: restoring
          ? {
              name: actorName(restoring.openedBy),
              at: restoring.startedAt,
              sessionId: restoring.id,
            }
          : null,
        now: this.clock.now(),
      });
      if (!interruption) {
        throw new ConflictException(
          original.endReason === 'no_heartbeat'
            ? 'Esta sesión no tenía tiempo restante'
            : 'Solo se restauran las sesiones interrumpidas por un corte',
        );
      }
      if (interruption.status === 'restored' && interruption.restoredBy) {
        const at = formatLocalTime(new Date(interruption.restoredBy.at));
        throw new ConflictException(
          `Esta sesión ya fue restaurada por ${interruption.restoredBy.name} a las ${at}`,
        );
      }
      if (interruption.status === 'expired') {
        throw new ConflictException('Esta sesión caducó: pasaron más de 48 horas desde el corte');
      }

      const [pc] = await tx.select().from(pcs).where(eq(pcs.id, input.pcId)).for('update');
      if (!pc) {
        throw new NotFoundException('No existe esa PC');
      }
      if (await this.sessions.activeOnPc(pc.id, tx)) {
        throw new ConflictException(`La ${pc.name} ya tiene una sesión abierta`);
      }
      if (!this.connections.isConnected(pc.id)) {
        throw new ConflictException(`La ${pc.name} no está conectada al nodo`);
      }

      const now = this.clock.now();
      const name = original.tempName ?? defaultTemporaryName(pc.name, now);
      const [created] = await tx
        .insert(sessions)
        .values({
          id: newId(),
          pcId: pc.id,
          kind: 'temporary',
          tempName: name,
          rateMicrosPerHour: original.rateMicrosPerHour,
          startedAt: now,
          lastHeartbeatAt: now,
          openedBy: actor,
          purchasedSeconds: remaining,
          restoredFrom: original.id,
        })
        .returning();
      if (!created) {
        throw new Error('No se pudo restaurar la sesión');
      }
      emit({
        type: 'session.restored',
        version: 1,
        actor,
        payload: {
          sessionId: created.id,
          restoredFrom: original.id,
          pc: { id: pc.id, name: pc.name },
          name,
          seconds: remaining,
        },
      });
      return created;
    });
    this.sessions.announce(row);
    const [described] = await this.describe([row]);
    if (!described) {
      throw new Error('No se pudo leer la sesión restaurada');
    }
    return described;
  }

  /**
   * Respaldo de sesiones temporales (REQ-001-64, REQ-001-65): las últimas N de cada PC, con
   * N del ajuste del administrador (mínimo 3), más las interrumpidas que siguen pendientes
   * de restaurar, aunque la PC haya tenido más sesiones después (REQ-001-71). Las sesiones
   * nunca se borran: esto solo decide cuáles se muestran. De la más reciente a la más antigua.
   */
  async backup(): Promise<TemporaryBackup> {
    const { temporarySessionsKeptPerPc: keptPerPc } = await this.settings.get();
    const ranked = this.db
      .select({
        id: sessions.id,
        rank: sql<number>`row_number() over (partition by ${sessions.pcId} order by ${sessions.startedAt} desc, ${sessions.id} desc)`.as(
          'rank',
        ),
      })
      .from(sessions)
      .where(eq(sessions.kind, 'temporary'))
      .as('ranked');
    const recent = await this.db
      .select({ id: ranked.id })
      .from(ranked)
      .where(lte(ranked.rank, keptPerPc));
    const pending = await this.pendingInterrupted();
    const ids = [...new Set([...recent.map((row) => row.id), ...pending.map((row) => row.id)])];
    const rows =
      ids.length === 0
        ? []
        : await this.db
            .select()
            .from(sessions)
            .where(inArray(sessions.id, ids))
            .orderBy(desc(sessions.startedAt), desc(sessions.id));
    return { keptPerPc, sessions: await this.describe(rows) };
  }

  /**
   * "Sesiones interrumpidas" (REQ-001-66): las cerradas por falta de latidos con tiempo
   * restante que aún se pueden restaurar. Primero la que se cortó más recientemente.
   */
  async interrupted(): Promise<TemporarySession[]> {
    return this.describe(await this.pendingInterrupted());
  }

  /**
   * Temporales cerradas sin latidos, con tiempo restante, sin restaurar y dentro de las 48 h
   * desde el corte, o sea, el último latido (REQ-001-71).
   */
  private async pendingInterrupted(): Promise<SessionRow[]> {
    const cutoff = new Date(this.clock.now().getTime() - RESTORE_WINDOW_MS);
    const restoring = alias(sessions, 'restoring');
    const rows = await this.db
      .select({ session: sessions })
      .from(sessions)
      .leftJoin(restoring, eq(restoring.restoredFrom, sessions.id))
      .where(
        and(
          eq(sessions.kind, 'temporary'),
          eq(sessions.status, 'ended'),
          eq(sessions.endReason, 'no_heartbeat'),
          gt(sql`${sessions.purchasedSeconds} - ${sessions.usedSeconds}`, 0),
          gte(sessions.lastHeartbeatAt, cutoff),
          isNull(restoring.id),
        ),
      )
      .orderBy(desc(sessions.lastHeartbeatAt));
    return rows.map((row) => row.session);
  }

  /**
   * Sesiones temporales como las ve el panel (REQ-001-64): con el nombre de la PC, lo
   * cobrado en total, el tiempo restante, quién las abrió y, si las cortó un corte, su
   * estado de interrupción.
   */
  async describe(rows: SessionRow[], db: Database = this.db): Promise<TemporarySession[]> {
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((row) => row.id);
    const now = this.clock.now();
    const [pcRows, chargeRows, restoringRows] = await Promise.all([
      db
        .select({ id: pcs.id, name: pcs.name })
        .from(pcs)
        .where(inArray(pcs.id, [...new Set(rows.map((row) => row.pcId))])),
      db
        .select({
          sessionId: sessionTopups.sessionId,
          total: sql<string>`sum(${sessionTopups.amountMicros})`,
        })
        .from(sessionTopups)
        .where(inArray(sessionTopups.sessionId, ids))
        .groupBy(sessionTopups.sessionId),
      // Las sesiones que restauraron a estas: dicen quién y cuándo (REQ-001-68).
      db.select().from(sessions).where(inArray(sessions.restoredFrom, ids)),
    ]);
    const pcNames = new Map(pcRows.map((pc) => [pc.id, pc.name]));
    const charged = new Map(chargeRows.map((r) => [r.sessionId, Number(r.total)]));
    const restoredBy = new Map<string, { name: string; at: Date; sessionId: string }>();
    for (const restoring of restoringRows) {
      if (restoring.restoredFrom) {
        restoredBy.set(restoring.restoredFrom, {
          name: actorName(restoring.openedBy),
          at: restoring.startedAt,
          sessionId: restoring.id,
        });
      }
    }
    return rows.map((row) => {
      const usage = temporaryUsageOf(row);
      return {
        id: row.id,
        pc: { id: row.pcId, name: pcNames.get(row.pcId) ?? '' },
        name: row.tempName ?? '',
        status: row.status,
        purchasedSeconds: usage.purchasedSeconds,
        remainingSeconds: temporaryRemaining(usage),
        amountMicros: micros(charged.get(row.id) ?? 0),
        rateMicrosPerHour: micros(row.rateMicrosPerHour),
        openedBy: actorName(row.openedBy),
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt?.toISOString() ?? null,
        endReason: row.endReason,
        restoredFrom: row.restoredFrom,
        interruption: interruptionOf({
          endReason: row.endReason,
          remainingSeconds: temporaryRemaining(usage),
          lastBeatAt: row.lastHeartbeatAt,
          restoredBy: restoredBy.get(row.id) ?? null,
          now,
        }),
      };
    });
  }
}

/** Nombre de quien hizo algo, para mostrarlo en el panel. */
function actorName(actor: Actor): string {
  switch (actor.kind) {
    case 'staff':
      return actor.name;
    case 'customer':
      return actor.username;
    case 'system':
      return 'Sistema';
  }
}
