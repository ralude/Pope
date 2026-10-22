import { HttpException, Inject, Injectable } from '@nestjs/common';
import {
  type PcWake,
  PC_WAKE_TIMEOUT_SECONDS,
  type PcWakeRequest,
  type PcWakeResponse,
  pcWakeErrorSchema,
  pcWakeResponseSchema,
  pcMacAddressSchema,
} from '@pope/shared';
import { and, eq, isNotNull, ne } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { pcControlStates, pcs } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';
import type { StaffActor } from './pc-commands.service.js';
import { PcConnections } from './pc-connections.js';
import { PcControlService } from './pc-control.service.js';
import { WakeOnLanSender } from './wake-on-lan.js';

type WakeErrorCode = ReturnType<typeof pcWakeErrorSchema.parse>['code'];

/** Error del contrato de encendido: `{ code, message }` con su estado HTTP. */
export class PcWakeException extends HttpException {
  constructor(code: WakeErrorCode, message: string, status = 409) {
    super(pcWakeErrorSchema.parse({ code, message }), status);
  }
}

/** Plazo y marca de una petición guardada, tal como las ve el panel. */
export function wakeOf(requestId: string, requestedAt: Date): PcWake {
  return {
    requestId,
    requestedAt: requestedAt.toISOString(),
    deadline: new Date(requestedAt.getTime() + PC_WAKE_TIMEOUT_SECONDS * 1_000).toISOString(),
  };
}

/**
 * Encender una PC por Wake-on-LAN (spec 003, T33; REQ-003-22). Es el nodo quien envía el
 * paquete: no hay orden a una PC apagada. Enviarlo no confirma el arranque; solo la conexión
 * de la PC lo hace, y entonces la petición se borra. A los 2 min el panel avisa, sin
 * diagnosticar avería, y el aviso se quita si la PC conecta después.
 */
@Injectable()
export class PcWakeService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly control: PcControlService,
    private readonly connections: PcConnections,
    private readonly sender: WakeOnLanSender,
    private readonly clock: Clock,
  ) {}

  async wake(pcId: string, request: PcWakeRequest, actor: StaffActor): Promise<PcWakeResponse> {
    const wake = await this.events.inTransaction(async (tx, emit) => {
      const pc = await this.control.lockPc(tx, pcId);
      if (!pc) throw new PcWakeException('unknown_pc', 'No existe esa PC', 404);
      await this.control.contextIn(tx, pcId);
      const [state] = await tx
        .select({ id: pcControlStates.wakeRequestId, at: pcControlStates.wakeRequestedAt })
        .from(pcControlStates)
        .where(eq(pcControlStates.pcId, pcId));
      // Doble clic o reintento: es la misma petición y no se vuelve a enviar.
      if (state?.id === request.id && state.at) return wakeOf(state.id, state.at);
      const [other] = await tx
        .select({ pcId: pcControlStates.pcId })
        .from(pcControlStates)
        .where(and(eq(pcControlStates.wakeRequestId, request.id), ne(pcControlStates.pcId, pcId)));
      if (other) throw new PcWakeException('idempotency_conflict', 'Ese ID identifica otra orden');
      if (this.connections.isConnected(pcId)) {
        throw new PcWakeException('pc_connected', `La ${pc.name} ya está encendida y conectada`);
      }
      const [row] = await tx.select({ mac: pcs.macAddress }).from(pcs).where(eq(pcs.id, pcId));
      const mac = pcMacAddressSchema.safeParse(row?.mac);
      if (!mac.success) {
        throw new PcWakeException(
          'mac_unknown',
          `La ${pc.name} no tiene registrada su tarjeta de red`,
        );
      }
      try {
        await this.sender.send(mac.data);
      } catch {
        throw new PcWakeException('wake_failed', 'No se pudo enviar el paquete de encendido', 500);
      }
      const now = this.clock.now();
      await tx
        .update(pcControlStates)
        .set({ wakeRequestId: request.id, wakeRequestedAt: now })
        .where(eq(pcControlStates.pcId, pcId));
      const saved = wakeOf(request.id, now);
      emit({
        type: 'pc.wake_requested',
        version: 1,
        actor,
        payload: { requestId: request.id, pc, macAddress: mac.data, deadline: saved.deadline },
      });
      return saved;
    });
    return pcWakeResponseSchema.parse({ pcId, wake });
  }

  /** La PC se conectó: el encendido terminó, a tiempo o tarde. No es un evento de dominio. */
  async connected(pcId: string): Promise<void> {
    await this.db
      .update(pcControlStates)
      .set({ wakeRequestId: null, wakeRequestedAt: null })
      .where(and(eq(pcControlStates.pcId, pcId), isNotNull(pcControlStates.wakeRequestId)));
  }
}
