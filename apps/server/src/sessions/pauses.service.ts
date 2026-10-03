import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  newId,
  type NodeToPcMessage,
  PAUSE_REFUSAL_MESSAGES,
  pauseMaxUntil,
  type PausesUsed,
  pausesOnDayOf,
  seconds,
} from '@pope/shared';
import { and, count, eq, gte } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { customers, pcs, sessionPauses, sessions } from '../db/schema.js';
import { type Emit, EventsService, type Transaction } from '../events/events.service.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  pauseBilling,
  type PauseRow,
  PcRequestRefused,
  remainingSeconds,
  type SessionRow,
} from './session-state.js';
import { openPauseOf, SessionsService } from './sessions.service.js';

/** Basta mirar dos días atrás para contar las pausas de un día de Caracas. */
const PAUSES_LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Pausa de las sesiones con cuenta (spec 002). Mientras una pausa no cobra, el tiempo de la
 * sesión no corre: eso lo aplica el cobro (`SessionsService.checkpoint`). Aquí se abren y se
 * cierran las pausas, siempre con la sesión bloqueada y con su evento (ADR-0008).
 */
@Injectable()
export class PausesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly sessions: SessionsService,
    private readonly settings: SettingsService,
    private readonly clock: Clock,
  ) {}

  /**
   * El cliente pausa su sesión desde la PC (REQ-002-01). Se cobra hasta este instante y desde
   * él ya no (REQ-002-03). Las temporales no pausan (REQ-002-11) y una sesión en pausa no
   * vuelve a pausar. Si al cobrar se agota, no se pausa: se cierra como cualquier sesión
   * agotada. Devuelve el `state` que debe mostrar la PC.
   */
  async pause(pcId: string): Promise<NodeToPcMessage> {
    await this.events.inTransaction(async (tx, emit) => {
      const locked = await this.lockActive(pcId, tx);
      if (locked.kind !== 'account' || !locked.customerId) {
        throw new PcRequestRefused('pause_unavailable', PAUSE_REFUSAL_MESSAGES.temporary);
      }
      const { row, account, pause } = await this.sessions.checkpoint(locked, tx);
      if (pause) {
        throw new PcRequestRefused('pause_unavailable', PAUSE_REFUSAL_MESSAGES.already_paused);
      }
      if (remainingSeconds(row, account?.balances ?? null) === 0) {
        return;
      }
      const customerId = locked.customerId;
      const now = this.clock.now();
      const maxUntil = pauseMaxUntil(now, await this.settings.get(tx));
      const used = await this.pausesUsed(row.id, customerId, now, tx);
      const actor: Actor = { kind: 'customer', customerId, username: account?.username ?? '' };
      await tx.insert(sessionPauses).values({
        id: newId(),
        sessionId: row.id,
        customerId,
        startedAt: now,
        maxUntil,
        startedBy: actor,
      });
      emit({
        type: 'session.paused',
        version: 1,
        actor,
        payload: {
          sessionId: row.id,
          pc: await this.pcRef(row.pcId, tx),
          pauseNumber: { inSession: used.inSession + 1, today: used.today + 1 },
          maxUntil: maxUntil.toISOString(),
        },
      });
    });
    // Con la pausa ya guardada: el `state` en pausa, y sin vigilar el agotamiento. Si se agotó
    // al cobrar, esta misma revisión la cierra.
    const { state } = await this.sessions.review(eq(sessions.pcId, pcId));
    return state;
  }

  /**
   * El cliente quita la pausa desde la PC tras confirmar que es él (REQ-002-10). Sin pausa
   * abierta no hace nada: la PC recibe su `state`, que la saca de la pantalla de pausa.
   */
  async resume(pcId: string): Promise<NodeToPcMessage> {
    await this.events.inTransaction(async (tx, emit) => {
      const locked = await this.lockActive(pcId, tx);
      const pause = await openPauseOf(locked.id, tx);
      if (!pause || !locked.customerId) {
        return;
      }
      const [customer] = await tx
        .select({ username: customers.username })
        .from(customers)
        .where(eq(customers.id, locked.customerId));
      const actor: Actor = {
        kind: 'customer',
        customerId: locked.customerId,
        username: customer?.username ?? '',
      };
      await this.end(locked, pause, actor, tx, emit);
    });
    // La sesión vuelve a cobrar desde ahora y a vigilarse (avisos y agotamiento).
    const { state } = await this.sessions.review(eq(sessions.pcId, pcId));
    return state;
  }

  /**
   * Cierra la pausa abierta de la sesión `locked` (bloqueada en `tx`) y emite
   * `session.resumed` con lo que no se cobró. Si no cobraba, la sesión vuelve a cobrar desde
   * ahora; si ya cobraba (venció con la opción a), sigue igual.
   */
  private async end(
    locked: SessionRow,
    pause: PauseRow,
    actor: Actor,
    tx: Transaction,
    emit: Emit,
  ): Promise<void> {
    // Primero se lleva la marca del cobro hasta ahora (sin cobrar si la pausa no cobra).
    const { row } = await this.sessions.checkpoint(locked, tx);
    const now = this.clock.now();
    const unbilledUntil = pause.billingResumedAt ?? now;
    await tx
      .update(sessionPauses)
      .set({ endedAt: now, endReason: 'resumed', endedBy: actor })
      .where(eq(sessionPauses.id, pause.id));
    if (!pauseBilling(pause)) {
      await tx.update(sessions).set({ lastHeartbeatAt: now }).where(eq(sessions.id, row.id));
    }
    emit({
      type: 'session.resumed',
      version: 1,
      actor,
      payload: {
        sessionId: row.id,
        pc: await this.pcRef(row.pcId, tx),
        unbilledSeconds: seconds(
          Math.max(0, Math.floor((unbilledUntil.getTime() - pause.startedAt.getTime()) / 1000)),
        ),
      },
    });
  }

  /** La sesión activa de la PC, bloqueada en `tx`; si no tiene, se rechaza la petición. */
  private async lockActive(pcId: string, tx: Transaction): Promise<SessionRow> {
    const [locked] = await tx
      .select()
      .from(sessions)
      .where(and(eq(sessions.pcId, pcId), eq(sessions.status, 'active')))
      .for('update');
    if (!locked) {
      throw new PcRequestRefused('no_active_session', 'No tienes una sesión abierta');
    }
    return locked;
  }

  /**
   * Pausas ya usadas: las de la sesión (REQ-002-21) y las de la cuenta en el día de Caracas,
   * en todas sus sesiones (REQ-002-24).
   */
  async pausesUsed(
    sessionId: string,
    customerId: string,
    now: Date,
    db: Database = this.db,
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

  private async pcRef(pcId: string, db: Database): Promise<{ id: string; name: string }> {
    const [pc] = await db.select({ name: pcs.name }).from(pcs).where(eq(pcs.id, pcId));
    return { id: pcId, name: pc?.name ?? '' };
  }
}
