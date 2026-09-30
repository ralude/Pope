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
  MAX_TEMPORARY_SECONDS,
  micros,
  newId,
  type TemporaryAddTimeRequest,
  type TemporaryOpenRequest,
  type TemporaryPurchase,
  temporaryPurchase,
  temporaryRemaining,
  type TemporarySession,
} from '@pope/shared';
import { eq, inArray, sql } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { pcs, sessions, sessionTopups } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';
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
   * Sesiones temporales como las ve el panel (REQ-001-64): con el nombre de la PC, lo
   * cobrado en total, el tiempo restante y quién las abrió.
   */
  async describe(rows: SessionRow[], db: Database = this.db): Promise<TemporarySession[]> {
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((row) => row.id);
    const [pcRows, chargeRows] = await Promise.all([
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
    ]);
    const pcNames = new Map(pcRows.map((pc) => [pc.id, pc.name]));
    const charged = new Map(chargeRows.map((r) => [r.sessionId, Number(r.total)]));
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
