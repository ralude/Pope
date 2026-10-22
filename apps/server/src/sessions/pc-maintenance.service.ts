import { Inject, Injectable } from '@nestjs/common';
import {
  type MaintenanceExit,
  type PcMaintenance,
  pcMaintenanceSchema,
  seconds,
} from '@pope/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { DATABASE, type Database } from '../db/database.js';
import { pcCommands, pcMaintenances } from '../db/schema.js';
import type { Emit, Transaction } from '../events/events.service.js';

/**
 * Mantenimientos de las PCs (spec 003, T35; REQ-003-40, REQ-003-41, REQ-003-43). El nodo
 * registra la entrada cuando la PC confirma que la aplicó (`applied`), con su propia hora, y
 * nunca por haber pedido o enviado la orden. No depende de `PcCommandsService`: este lo usa.
 */
@Injectable()
export class PcMaintenanceService {
  /**
   * Petición del Shell que originó cada entrada local, para contestarle con el acuse. Solo en
   * memoria: si el nodo se reinicia en esos 30 s, la PC lo ve en `maintenanceState` al conectar.
   */
  private readonly requests = new Map<string, string>();

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Mantenimiento abierto de la PC, o `null`. */
  async current(pcId: string, db: Database | Transaction = this.db): Promise<PcMaintenance | null> {
    const [row] = await db
      .select()
      .from(pcMaintenances)
      .where(and(eq(pcMaintenances.pcId, pcId), isNull(pcMaintenances.endedAt)));
    return row
      ? pcMaintenanceSchema.parse({
          id: row.id,
          pc: { id: row.pcId, name: row.pcName },
          actor: row.actor,
          source: row.source,
          startedAt: row.startedAt.toISOString(),
        })
      : null;
  }

  /**
   * Registra la entrada que la PC confirmó, con el actor de la orden y la hora del nodo, y
   * emite `pc.maintenance_started`. Llamar con la fila de la PC bloqueada.
   */
  async startIn(
    tx: Transaction,
    emit: Emit,
    command: typeof pcCommands.$inferSelect,
    pcName: string,
    now: Date,
  ): Promise<PcMaintenance> {
    const { action, actor } = command;
    if (action.kind !== 'startMaintenance' || actor.kind !== 'staff') {
      throw new Error('Solo una orden del personal inicia un mantenimiento');
    }
    await tx.insert(pcMaintenances).values({
      id: action.maintenanceId,
      pcId: command.pcId,
      pcName,
      actor,
      source: action.source,
      startedAt: now,
    });
    emit({
      type: 'pc.maintenance_started',
      version: 1,
      actor,
      payload: {
        maintenanceId: action.maintenanceId,
        pc: { id: command.pcId, name: pcName },
        source: action.source,
        startedAt: now.toISOString(),
      },
    });
    return pcMaintenanceSchema.parse({
      id: action.maintenanceId,
      pc: { id: command.pcId, name: pcName },
      actor,
      source: action.source,
      startedAt: now.toISOString(),
    });
  }

  /**
   * Registra la salida durable que informa la PC (REQ-003-41, REQ-003-44). Idempotente: una
   * salida ya registrada es `duplicate` y no cambia nada; la de un mantenimiento que no es de
   * esta PC, o con un ID de salida ya usado, es `unknown`. El actor es quien abrió el
   * mantenimiento, salvo que exista una orden `endMaintenance` del panel con ese `exitId`:
   * entonces es el actor de esa orden. La duración nunca supera el tiempo que el nodo vio
   * abierto el mantenimiento. Llamar con la fila de la PC bloqueada.
   */
  async endIn(
    tx: Transaction,
    emit: Emit,
    input: { pcId: string; pcName: string; exit: MaintenanceExit; now: Date },
  ): Promise<'recorded' | 'duplicate' | 'unknown'> {
    const { pcId, pcName, exit, now } = input;
    const [row] = await tx
      .select()
      .from(pcMaintenances)
      .where(and(eq(pcMaintenances.id, exit.maintenanceId), eq(pcMaintenances.pcId, pcId)))
      .for('update');
    if (!row) return 'unknown';
    if (row.endedAt) return 'duplicate';
    const [used] = await tx
      .select({ id: pcMaintenances.id })
      .from(pcMaintenances)
      .where(eq(pcMaintenances.exitId, exit.id));
    if (used) return 'unknown';
    const [order] = await tx
      .select({ actor: pcCommands.actor })
      .from(pcCommands)
      .where(
        and(
          eq(pcCommands.pcId, pcId),
          sql`${pcCommands.action}->>'kind' = 'endMaintenance'`,
          sql`${pcCommands.action}->>'exitId' = ${exit.id}`,
        ),
      );
    const panelActor = order?.actor.kind === 'staff' ? order.actor : null;
    const source = panelActor ? 'panel' : 'local';
    const endedBy = panelActor ?? row.actor;
    const seen = Math.max(0, Math.floor((now.getTime() - row.startedAt.getTime()) / 1_000));
    const durationSeconds = Math.min(exit.durationSeconds, seen);
    const reported = new Date(exit.endedAt).getTime();
    const endedAt = new Date(Math.min(now.getTime(), Math.max(row.startedAt.getTime(), reported)));
    await tx
      .update(pcMaintenances)
      .set({ exitId: exit.id, endedAt, durationSeconds, endedBy, exitSource: source })
      .where(eq(pcMaintenances.id, row.id));
    emit({
      type: 'pc.maintenance_ended',
      version: 1,
      actor: endedBy,
      payload: {
        maintenanceId: row.id,
        exitId: exit.id,
        pc: { id: pcId, name: pcName },
        source,
        startedAt: row.startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationSeconds: seconds(durationSeconds),
      },
    });
    return 'recorded';
  }

  /** Recuerda la petición del Shell que originó una entrada local (T35c). */
  remember(commandId: string, requestId: string): void {
    this.requests.set(commandId, requestId);
  }

  /** Petición del Shell de esa orden, que se olvida: se usa al llegar su resultado final. */
  take(commandId: string): string | undefined {
    const requestId = this.requests.get(commandId);
    this.requests.delete(commandId);
    return requestId;
  }
}
