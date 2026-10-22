import { Injectable } from '@nestjs/common';
import { newId, type PcCommandRequest, type PcCommandResponse } from '@pope/shared';

import { EventsService } from '../events/events.service.js';
import { PcConnections } from './pc-connections.js';
import {
  canonical,
  type CommandRow,
  PcCommandException,
  PcCommandsService,
  responseOf,
  type StaffActor,
} from './pc-commands.service.js';
import { PcControlService } from './pc-control.service.js';
import { type ClosedSession, SessionsService } from './sessions.service.js';

/**
 * Peticiones de órdenes desde el panel (REQ-003-20). El ID las hace idempotentes: repetirla
 * (doble clic, reintento) devuelve la misma orden; reutilizarlo con otra petición es un
 * conflicto. Cada tipo se activa en su tarea (T28–T40).
 */
@Injectable()
export class PcCommandRequestsService {
  constructor(
    private readonly events: EventsService,
    private readonly control: PcControlService,
    private readonly commands: PcCommandsService,
    private readonly sessions: SessionsService,
    private readonly connections: PcConnections,
  ) {}

  async issue(
    pcId: string,
    request: PcCommandRequest,
    actor: StaffActor,
  ): Promise<PcCommandResponse> {
    const issued = await this.events.inTransaction(
      async (tx, emit): Promise<{ row: CommandRow; closed?: ClosedSession; fresh: boolean }> => {
        const pc = await this.control.lockPc(tx, pcId);
        const existing = await this.commands.find(tx, request.id);
        if (existing) {
          if (existing.pcId !== pcId || canonical(existing.request) !== canonical(request)) {
            throw new PcCommandException('idempotency_conflict', 'Ese ID identifica otra orden');
          }
          return { row: existing, fresh: false };
        }
        if (!pc) throw new PcCommandException('unknown_pc', 'No existe esa PC', 404);
        // Bloquear, reiniciar y apagar, con la PC libre o con sesión (T29/T30), mensajes (T32)
        // y entrar en mantenimiento con la PC libre (T35). Con un mantenimiento abierto hace
        // falta registrar antes su salida (T39/T40) y los mensajes se rechazan (REQ-003-20):
        // aún no disponible.
        if (request.kind === 'endMaintenance' || request.expected.kind === 'maintenance') {
          throw new PcCommandException('invalid_command', 'Esta orden aún no está disponible', 400);
        }
        if (!this.connections.isConnected(pcId)) {
          throw new PcCommandException('pc_disconnected', `La ${pc.name} no está conectada`);
        }
        const context = await this.control.contextIn(tx, pcId);
        if (canonical(request.expected) !== canonical(context)) {
          throw new PcCommandException(
            'stale_context',
            `La ${pc.name} cambió de estado. Revisa el mapa y vuelve a intentarlo`,
          );
        }
        if (request.kind === 'showMessage') {
          // Un mensaje no ocupa la PC ni espera a otras órdenes: no la reserva. Si la sesión
          // o el estado cambian antes de mostrarse, la PC lo descarta por su contexto.
          const row = await this.commands.insertIn(tx, emit, {
            pc,
            actor,
            request,
            action: { kind: 'showMessage', text: request.text },
            context,
            reserve: false,
          });
          return { row, fresh: true };
        }
        const holder = await this.commands.holder(tx, pcId);
        if (holder && this.commands.inFlight(holder)) {
          throw new PcCommandException(
            'pc_unavailable',
            `La ${pc.name} ya tiene una orden en curso`,
          );
        }
        if (request.kind === 'startMaintenance') {
          // REQ-003-43: la PC debe estar libre (el esquema y el contexto ya lo exigen). Reserva
          // la PC como un bloqueo; el nodo registra la entrada cuando la PC la confirma.
          const row = await this.commands.insertIn(tx, emit, {
            pc,
            actor,
            request,
            action: { kind: 'startMaintenance', maintenanceId: newId(), source: 'panel' },
            context,
          });
          return { row, fresh: true };
        }
        const kind = request.kind;
        if (context.kind === 'session') {
          // REQ-003-20: Bloquear, reiniciar y apagar cierran antes la sesión con las reglas
          // existentes, también en pausa o temporal (REQ-001-69), y la orden que sigue al cierre
          // lleva el ID del panel. Si el cierre falla, nada se envía (se deshace todo).
          const closed = await this.sessions.closeIn(tx, emit, context.sessionId, 'staff', actor, {
            order: { request, action: { kind } },
          });
          if (!closed?.lock) throw new Error('No se pudo cerrar la sesión antes de la orden');
          return { row: closed.lock, closed, fresh: true };
        }
        const row = await this.commands.insertIn(tx, emit, {
          pc,
          actor,
          request,
          action: { kind },
          context,
        });
        return { row, fresh: true };
      },
    );
    if (issued.closed) this.sessions.afterClose(issued.closed);
    else if (issued.fresh) this.commands.dispatch(issued.row);
    return responseOf(issued.row);
  }
}
