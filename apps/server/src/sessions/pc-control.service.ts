import { Inject, Injectable } from '@nestjs/common';
import { newId, type PcControlContext } from '@pope/shared';
import { and, eq, isNull } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { pcControlStates, pcMaintenances, pcs, sessionPauses, sessions } from '../db/schema.js';
import type { Transaction } from '../events/events.service.js';
import { PcConnections } from './pc-connections.js';

/** Por qué una PC no admite ahora una sesión nueva. */
export type PcUnavailability = 'reserved' | 'maintenance';

/** Texto para el cliente o el encargado cuando la PC no admite una sesión nueva. */
export function pcUnavailableMessage(reason: PcUnavailability, pcName: string): string {
  return reason === 'maintenance'
    ? `La ${pcName} está en mantenimiento`
    : `La ${pcName} tiene una orden del encargado en curso`;
}

function sameContext(a: PcControlContext | null, b: PcControlContext): boolean {
  return (
    a?.kind === b.kind &&
    a.revision === b.revision &&
    (a.kind !== 'session' || (b.kind === 'session' && a.sessionId === b.sessionId)) &&
    (a.kind !== 'maintenance' || (b.kind === 'maintenance' && a.maintenanceId === b.maintenanceId))
  );
}

/**
 * Contexto de control de cada PC (spec 003, T28; plan T02b): libre, sesión o mantenimiento,
 * con una revisión UUIDv7 que cambia al cambiar la ocupación o la pausa, no al descontar
 * segundos. Las órdenes del panel lo devuelven en `expected` y la PC lo compara antes de
 * ejecutarlas. La revisión se recalcula al leer, con la fila de la PC bloqueada: así ningún
 * camino que abre, pausa o cierra sesiones tiene que acordarse de cambiarla.
 */
@Injectable()
export class PcControlService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly connections: PcConnections,
    private readonly clock: Clock,
  ) {}

  /**
   * Bloquea la fila de la PC (`for update`). Todo camino que pueda ocupar la PC (login,
   * temporal, restauración, órdenes y mantenimiento) pasa por aquí antes de decidir, de modo
   * que se ejecutan de uno en uno sobre la misma PC.
   */
  async lockPc(tx: Transaction, pcId: string): Promise<{ id: string; name: string } | undefined> {
    const [pc] = await tx
      .select({ id: pcs.id, name: pcs.name })
      .from(pcs)
      .where(eq(pcs.id, pcId))
      .for('update');
    return pc;
  }

  /**
   * Contexto vigente de la PC. Llamar con la fila de la PC ya bloqueada (`lockPc`): crea la
   * fila de control la primera vez y cambia la revisión si la ocupación es otra.
   */
  async contextIn(tx: Transaction, pcId: string): Promise<PcControlContext> {
    const [maintenance] = await tx
      .select({ id: pcMaintenances.id })
      .from(pcMaintenances)
      .where(and(eq(pcMaintenances.pcId, pcId), isNull(pcMaintenances.endedAt)));
    const [session] = maintenance
      ? []
      : await tx
          .select({
            id: sessions.id,
            pauseId: sessionPauses.id,
            billing: sessionPauses.billingResumedAt,
          })
          .from(sessions)
          .leftJoin(
            sessionPauses,
            and(eq(sessionPauses.sessionId, sessions.id), isNull(sessionPauses.endedAt)),
          )
          .where(and(eq(sessions.pcId, pcId), eq(sessions.status, 'active')));
    // La pausa y su cobro tras vencer forman parte de la ocupación: una orden confirmada
    // con la sesión en uso no vale si después se pausó.
    const occupancy = maintenance
      ? `maintenance:${maintenance.id}`
      : session
        ? `session:${session.id}:${session.pauseId ?? '-'}:${session.billing ? 'billing' : '-'}`
        : 'free';
    const [stored] = await tx
      .select({ revision: pcControlStates.revision, occupancy: pcControlStates.occupancy })
      .from(pcControlStates)
      .where(eq(pcControlStates.pcId, pcId));
    let revision = stored?.revision;
    if (!stored) {
      revision = newId();
      await tx.insert(pcControlStates).values({ pcId, revision, occupancy });
    } else if (stored.occupancy !== occupancy) {
      revision = newId();
      await tx
        .update(pcControlStates)
        .set({ revision, occupancy })
        .where(eq(pcControlStates.pcId, pcId));
    }
    if (revision === undefined) throw new Error('Revisión de control ausente');
    if (maintenance) return { kind: 'maintenance', revision, maintenanceId: maintenance.id };
    if (session) return { kind: 'session', revision, sessionId: session.id };
    return { kind: 'free', revision };
  }

  /**
   * Si la PC no admite una sesión nueva: orden del personal en curso (reserva) o
   * mantenimiento abierto. Para decidir, llamar con la fila de la PC ya bloqueada; sin
   * bloquearla sirve como comprobación previa.
   */
  async unavailableIn(tx: Database, pcId: string): Promise<PcUnavailability | null> {
    const [maintenance] = await tx
      .select({ id: pcMaintenances.id })
      .from(pcMaintenances)
      .where(and(eq(pcMaintenances.pcId, pcId), isNull(pcMaintenances.endedAt)));
    if (maintenance) return 'maintenance';
    const [state] = await tx
      .select({ reserved: pcControlStates.reservedCommandId })
      .from(pcControlStates)
      .where(eq(pcControlStates.pcId, pcId));
    return state?.reserved ? 'reserved' : null;
  }

  /** Contexto vigente de la PC, en su propia transacción. `null` si la PC no existe. */
  async current(pcId: string): Promise<PcControlContext | null> {
    return this.db.transaction(async (tx) =>
      (await this.lockPc(tx, pcId)) ? this.contextIn(tx, pcId) : null,
    );
  }

  /**
   * Envía `controlState` a la PC si su copia (`known`, de su `hello` o su latido) no es la
   * vigente. La PC lo guarda para validar las órdenes y para recuperar tras reiniciar.
   */
  async sync(pcId: string, known: PcControlContext | null): Promise<void> {
    const context = await this.current(pcId);
    if (!context || sameContext(known, context)) return;
    this.connections.send(pcId, {
      type: 'controlState',
      context,
      serverTime: this.clock.now().toISOString(),
    });
  }
}
