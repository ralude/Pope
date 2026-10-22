import { Inject, Injectable } from '@nestjs/common';
import { type PcMaintenance, pcMaintenanceSchema } from '@pope/shared';
import { and, eq, isNull } from 'drizzle-orm';

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
