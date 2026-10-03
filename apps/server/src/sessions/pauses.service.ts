import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  type Actor,
  newId,
  type NodeToPcMessage,
  PAUSE_REFUSAL_MESSAGES,
  pauseAllowance,
  pauseExpired,
  pauseMaxUntil,
  pauseRefusal,
  seconds,
} from '@pope/shared';
import { and, eq, isNull } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { customers, pcs, sessionPauses, sessions } from '../db/schema.js';
import { type Emit, EventsService, type Transaction } from '../events/events.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { openPauseOf, pausesUsed } from './pause-queries.js';
import { PcConnections } from './pc-connections.js';
import {
  pauseBilling,
  type PauseRow,
  PcRequestRefused,
  remainingSeconds,
  type SessionRow,
} from './session-state.js';
import { SessionsService } from './sessions.service.js';

const SYSTEM: Actor = { kind: 'system' };
/** Margen para que el temporizador no salte unos milisegundos antes de `max_until`. */
const EXPIRY_SLACK_MS = 20;

/**
 * Pausa de las sesiones con cuenta (spec 002). Mientras una pausa no cobra, el tiempo de la
 * sesión no corre: eso lo aplica el cobro (`SessionsService.checkpoint`). Aquí se abren, se
 * cierran y vencen las pausas, siempre con la sesión bloqueada y con su evento (ADR-0008).
 */
@Injectable()
export class PausesService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Pauses');
  /** Cómo cancelar el temporizador de vencimiento de cada pausa abierta, por sesión. */
  private readonly timers = new Map<string, () => void>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly sessions: SessionsService,
    private readonly settings: SettingsService,
    private readonly connections: PcConnections,
    private readonly clock: Clock,
  ) {}

  /**
   * El cliente pausa su sesión desde la PC (REQ-002-01). Se cobra hasta este instante y desde
   * él ya no (REQ-002-03). Las temporales no pausan (REQ-002-11), una sesión en pausa no
   * vuelve a pausar, y hacen falta pausas libres en la sesión y en el día y la pausa activada
   * en el local (REQ-002-21, REQ-002-23, REQ-002-24). Si al cobrar se agota, no se pausa: se
   * cierra como cualquier sesión agotada. Devuelve el `state` que debe mostrar la PC.
   */
  async pause(pcId: string): Promise<NodeToPcMessage> {
    const opened = await this.events.inTransaction(async (tx, emit) => {
      const locked = await this.lockActive(pcId, tx);
      if (locked.kind !== 'account' || !locked.customerId) {
        throw new PcRequestRefused('pause_unavailable', PAUSE_REFUSAL_MESSAGES.temporary);
      }
      const customerId = locked.customerId;
      const { row, account, pause } = await this.sessions.checkpoint(locked, tx);
      const now = this.clock.now();
      const settings = await this.settings.get(tx);
      const used = await pausesUsed(tx, row.id, customerId, now);
      const refusal = pauseRefusal({
        kind: row.kind,
        paused: pause !== null,
        allowance: pauseAllowance(settings, used),
      });
      if (refusal) {
        throw new PcRequestRefused('pause_unavailable', PAUSE_REFUSAL_MESSAGES[refusal]);
      }
      if (remainingSeconds(row, account?.balances ?? null) === 0) {
        return null;
      }
      const maxUntil = pauseMaxUntil(now, settings);
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
      return { sessionId: row.id, maxUntil };
    });
    if (opened) {
      this.schedule(opened.sessionId, opened.maxUntil);
    }
    // Con la pausa ya guardada: el `state` en pausa, y sin vigilar el agotamiento. Si se agotó
    // al cobrar, esta misma revisión la cierra.
    const { state } = await this.sessions.review(eq(sessions.pcId, pcId));
    return state;
  }

  /**
   * El cliente quita la pausa desde la PC tras confirmar que es él (REQ-002-10). Sin pausa
   * abierta no hace nada: la PC recibe su `state`, que la saca de la pantalla de pausa. Si la
   * pausa ya llegó a su duración máxima y aún no se aplicó, se aplica antes (REQ-002-22): con
   * la opción b) la sesión se cierra en lugar de reanudarse.
   */
  async resume(pcId: string): Promise<NodeToPcMessage> {
    const active = await this.sessions.activeOnPc(pcId);
    if (!active) {
      throw new PcRequestRefused('no_active_session', 'No tienes una sesión abierta');
    }
    await this.expireIfDue(active.id);
    const resumed = await this.events.inTransaction(async (tx, emit) => {
      const [locked] = await tx
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, active.id), eq(sessions.status, 'active')))
        .for('update');
      const pause = locked ? await openPauseOf(locked.id, tx) : null;
      if (!locked?.customerId || !pause) {
        return false;
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
      return true;
    });
    if (resumed) {
      this.cancel(active.id);
    }
    // La sesión vuelve a cobrar desde ahora y a vigilarse (avisos y agotamiento). Si se cerró
    // al vencer, la PC ya recibió `sessionEnded` y aquí recibe el bloqueo.
    const { state } = await this.sessions.review(eq(sessions.pcId, pcId));
    return state;
  }

  /**
   * La pausa de la sesión llegó a su duración máxima (REQ-002-20, REQ-002-22). Según el
   * ajuste vigente al vencer: a) se vuelve a cobrar desde `max_until` aunque la PC siga en la
   * pantalla de pausa (CA-002-05), o b) se cierra la sesión, sin cobrar la pausa. Emite
   * `session.pause_expired`. No hace nada si la pausa ya no está abierta, ya cobra o aún no
   * vence: la llaman el temporizador, la reanudación y el arranque del nodo.
   */
  async expire(sessionId: string): Promise<void> {
    const settings = await this.settings.get();
    if (settings.pauseOverrun === 'close') {
      await this.sessions.close(sessionId, 'pause_expired', SYSTEM, {
        pauseEndReason: 'expired_closed',
        within: async (tx, emit, locked) => {
          const pause = await openPauseOf(locked.id, tx);
          if (!pause || !this.due(pause)) {
            return false;
          }
          emit({
            type: 'session.pause_expired',
            version: 1,
            actor: SYSTEM,
            payload: {
              sessionId: locked.id,
              pc: await this.pcRef(locked.pcId, tx),
              action: 'close',
            },
          });
          return true;
        },
      });
      this.cancel(sessionId);
      return;
    }

    const pcId = await this.events.inTransaction(async (tx, emit) => {
      const [locked] = await tx
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, sessionId), eq(sessions.status, 'active')))
        .for('update');
      const pause = locked ? await openPauseOf(locked.id, tx) : null;
      if (!locked || !pause || !this.due(pause)) {
        return null;
      }
      // Se cobra desde el fin de la pausa: hasta ahí la marca no pasó (`checkpoint`).
      await tx
        .update(sessionPauses)
        .set({ billingResumedAt: pause.maxUntil })
        .where(eq(sessionPauses.id, pause.id));
      await tx
        .update(sessions)
        .set({ lastHeartbeatAt: pause.maxUntil })
        .where(eq(sessions.id, locked.id));
      emit({
        type: 'session.pause_expired',
        version: 1,
        actor: SYSTEM,
        payload: {
          sessionId: locked.id,
          pc: await this.pcRef(locked.pcId, tx),
          action: 'resume_billing',
        },
      });
      return locked.pcId;
    });
    this.cancel(sessionId);
    if (pcId) {
      // La PC sigue en la pantalla de pausa, ahora con el tiempo corriendo; y la sesión vuelve
      // a vigilarse: avisos y agotamiento.
      const { state } = await this.sessions.review(eq(sessions.id, sessionId));
      this.connections.send(pcId, state);
    }
  }

  /** Aplica el vencimiento si la pausa abierta de la sesión ya llegó a su fin. */
  private async expireIfDue(sessionId: string): Promise<void> {
    const pause = await openPauseOf(sessionId, this.db);
    if (pause && this.due(pause)) {
      await this.expire(sessionId);
    }
  }

  /** La pausa no cobra todavía y ya llegó a su duración máxima. */
  private due(pause: PauseRow): boolean {
    return !pauseBilling(pause) && pauseExpired(pause.maxUntil, this.clock.now());
  }

  /** Programa el vencimiento de la pausa de una sesión a su `max_until`. */
  private schedule(sessionId: string, maxUntil: Date): void {
    this.cancel(sessionId);
    const delay = Math.max(0, maxUntil.getTime() - this.clock.now().getTime());
    this.timers.set(
      sessionId,
      this.clock.schedule(delay + EXPIRY_SLACK_MS, async () => {
        this.timers.delete(sessionId);
        try {
          await this.expire(sessionId);
        } catch (error) {
          this.logger.error(`Error al vencer la pausa de la sesión ${sessionId}`, error);
        }
      }),
    );
  }

  private cancel(sessionId: string): void {
    this.timers.get(sessionId)?.();
    this.timers.delete(sessionId);
  }

  /**
   * Al arrancar el nodo (REQ-002-31): las pausas abiertas que vencieron mientras estaba
   * apagado se aplican ya, con la hora de su `max_until`; las demás se programan.
   */
  async onApplicationBootstrap(): Promise<void> {
    const open = await this.db
      .select({ sessionId: sessionPauses.sessionId, maxUntil: sessionPauses.maxUntil })
      .from(sessionPauses)
      .innerJoin(sessions, eq(sessions.id, sessionPauses.sessionId))
      .where(
        and(
          isNull(sessionPauses.endedAt),
          isNull(sessionPauses.billingResumedAt),
          eq(sessions.status, 'active'),
        ),
      );
    for (const { sessionId, maxUntil } of open) {
      if (pauseExpired(maxUntil, this.clock.now())) {
        try {
          await this.expire(sessionId);
        } catch (error) {
          this.logger.error(`Error al vencer la pausa de la sesión ${sessionId}`, error);
        }
      } else {
        this.schedule(sessionId, maxUntil);
      }
    }
  }

  onModuleDestroy(): void {
    for (const cancel of this.timers.values()) {
      cancel();
    }
    this.timers.clear();
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

  private async pcRef(pcId: string, db: Database): Promise<{ id: string; name: string }> {
    const [pc] = await db.select({ name: pcs.name }).from(pcs).where(eq(pcs.id, pcId));
    return { id: pcId, name: pc?.name ?? '' };
  }
}
