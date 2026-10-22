import { HttpException, Inject, Injectable } from '@nestjs/common';
import {
  type PcRevokeRequest,
  type PcRevokeResponse,
  pcRevocationErrorSchema,
  pcRevokeResponseSchema,
  newId,
} from '@pope/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { events, pcCredentials, sessionHolds, sessions } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';
import { PcCommandsService, type StaffActor } from './pc-commands.service.js';
import { PcControlService } from './pc-control.service.js';
import { SessionsService } from './sessions.service.js';

type RevocationErrorCode = ReturnType<typeof pcRevocationErrorSchema.parse>['code'];

/** Error del contrato de revocación: `{ code, message }` con su estado HTTP. */
export class PcRevocationException extends HttpException {
  constructor(code: RevocationErrorCode, message: string, status = 409) {
    super(pcRevocationErrorSchema.parse({ code, message }), status);
  }
}

/**
 * Revocar una PC conservando su sesión (spec 003, T34; REQ-003-11; diseño en `diseno-t34.md`).
 * La credencial queda revocada y, si la PC tenía sesión, se abre una retención: el nodo cobra
 * hasta ese instante y desde entonces no cobra, no cierra por falta de latidos ni vence la
 * pausa (T34d). La PC no confirma nada: sin credencial no puede hablar con el nodo.
 */
@Injectable()
export class PcRevocationService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly control: PcControlService,
    private readonly commands: PcCommandsService,
    private readonly sessions: SessionsService,
    private readonly clock: Clock,
  ) {}

  async revoke(
    pcId: string,
    request: PcRevokeRequest,
    actor: StaffActor,
  ): Promise<PcRevokeResponse> {
    return this.events.inTransaction(async (tx, emit) => {
      const pc = await this.control.lockPc(tx, pcId);
      if (!pc) throw new PcRevocationException('unknown_pc', 'No existe esa PC', 404);

      // Repetir la petición (doble clic, reintento) devuelve lo mismo y no revoca otra vez.
      const [previous] = await tx
        .select({ payload: events.payload })
        .from(events)
        .where(
          and(
            eq(events.type, 'pc.credential_revoked'),
            sql`${events.payload}->>'requestId' = ${request.id}`,
          ),
        );
      if (previous) {
        const payload = previous.payload as {
          pc: { id: string };
          credentialId: string;
          heldSessionId: string | null;
        };
        if (payload.pc.id !== pcId) {
          throw new PcRevocationException('idempotency_conflict', 'Ese ID identifica otra orden');
        }
        // La hora es la del nodo al revocar, guardada en la credencial.
        const [revoked] = await tx
          .select({ revokedAt: pcCredentials.revokedAt })
          .from(pcCredentials)
          .where(eq(pcCredentials.id, payload.credentialId));
        return pcRevokeResponseSchema.parse({
          pc,
          revokedAt: (revoked?.revokedAt ?? this.clock.now()).toISOString(),
          heldSessionId: payload.heldSessionId,
        });
      }

      const [credential] = await tx
        .select({ id: pcCredentials.id })
        .from(pcCredentials)
        .where(and(eq(pcCredentials.pcId, pcId), isNull(pcCredentials.revokedAt)));
      if (!credential) {
        throw new PcRevocationException(
          'pc_not_registered',
          `La ${pc.name} no tiene una credencial vigente`,
        );
      }
      // Un mantenimiento termina antes; una orden del panel en curso, también (mantenedor, T34).
      const unavailable = await this.control.unavailableIn(tx, pcId);
      if (unavailable === 'maintenance') {
        throw new PcRevocationException(
          'pc_unavailable',
          `Termina antes el mantenimiento de la ${pc.name}`,
        );
      }
      const holder = await this.commands.holder(tx, pcId);
      if (holder && this.commands.inFlight(holder)) {
        throw new PcRevocationException(
          'pc_unavailable',
          `La ${pc.name} tiene una orden en curso. Espera a que termine`,
        );
      }

      const now = this.clock.now();
      let heldSessionId: string | null = null;
      const active = await this.sessions.activeOnPc(pcId, tx);
      if (active) {
        const [locked] = await tx
          .select()
          .from(sessions)
          .where(and(eq(sessions.id, active.id), eq(sessions.status, 'active')))
          .for('update');
        if (locked) {
          // Se cobra hasta ahora (o hasta el último contacto, si la PC está en silencio): desde
          // aquí el nodo no cobra mientras dure la retención.
          await this.sessions.checkpoint(locked, tx);
          await tx.insert(sessionHolds).values({
            id: newId(),
            sessionId: locked.id,
            pcId,
            revokedCredentialId: credential.id,
            startedAt: now,
            startedBy: actor,
          });
          heldSessionId = locked.id;
        }
      }
      await tx
        .update(pcCredentials)
        .set({ revokedAt: now, revokedByStaffId: actor.staffId })
        .where(eq(pcCredentials.id, credential.id));
      emit({
        type: 'pc.credential_revoked',
        version: 1,
        actor,
        payload: { requestId: request.id, pc, credentialId: credential.id, heldSessionId },
      });
      return pcRevokeResponseSchema.parse({ pc, revokedAt: now.toISOString(), heldSessionId });
    });
  }
}
