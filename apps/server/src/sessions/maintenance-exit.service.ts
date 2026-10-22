import { Injectable } from '@nestjs/common';
import type { MaintenanceExit } from '@pope/shared';
import { eq } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { pcMaintenances } from '../db/schema.js';
import { EventsService, type Transaction } from '../events/events.service.js';
import { PcCommandsService } from './pc-commands.service.js';
import { PcConnections, type PcIdentity } from './pc-connections.js';
import { PcControlService } from './pc-control.service.js';
import { PcMaintenanceService } from './pc-maintenance.service.js';

/**
 * Salida del mantenimiento que informa la PC (spec 003, T39a; REQ-003-41, REQ-003-44,
 * CA-003-09). La PC la guarda de forma durable y la reenvía hasta que el nodo la reconoce, así
 * que puede llegar repetida o tarde: se registra una sola vez y siempre se reconoce.
 */
@Injectable()
export class MaintenanceExitService {
  constructor(
    private readonly events: EventsService,
    private readonly control: PcControlService,
    private readonly maintenance: PcMaintenanceService,
    private readonly commands: PcCommandsService,
    private readonly connections: PcConnections,
    private readonly clock: Clock,
  ) {}

  async receive(pc: PcIdentity, exit: MaintenanceExit): Promise<void> {
    const outcome = await this.events.inTransaction(async (tx, emit) => {
      await this.control.lockPc(tx, pc.id);
      const result = await this.maintenance.endIn(tx, emit, {
        pcId: pc.id,
        pcName: pc.name,
        exit,
        now: this.clock.now(),
      });
      // Como tras cualquier cierre, la PC queda reservada hasta que el agente confirme el
      // bloqueo (T29). Una salida pedida desde el panel ya tiene su orden y su reserva.
      const lock =
        result === 'recorded' && (await this.wasLocal(tx, exit.id))
          ? await this.commands.insertAfterCloseIn(tx, emit, pc, { kind: 'system' })
          : null;
      return { result, lock };
    });
    // Un mantenimiento que no es de esta PC no se reconoce: no debe poder cerrarlo nadie.
    if (outcome.result !== 'unknown') {
      this.connections.send(pc.id, {
        type: 'maintenanceExitAcknowledged',
        exitId: exit.id,
        maintenanceId: exit.maintenanceId,
      });
    }
    if (outcome.lock) this.commands.dispatch(outcome.lock);
  }

  private async wasLocal(tx: Transaction, exitId: string): Promise<boolean> {
    const [row] = await tx
      .select({ source: pcMaintenances.exitSource })
      .from(pcMaintenances)
      .where(eq(pcMaintenances.exitId, exitId));
    return row?.source === 'local';
  }
}
