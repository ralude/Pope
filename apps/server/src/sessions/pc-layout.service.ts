import { Injectable, NotFoundException } from '@nestjs/common';
import type { Actor, PcMapCell, PcMapLayoutRequest } from '@pope/shared';
import { asc, eq, inArray } from 'drizzle-orm';

import { pcs } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';

interface Change {
  pc: { id: string; name: string };
  from: PcMapCell | null;
  to: PcMapCell | null;
}

const sameCell = (a: PcMapCell | null, b: PcMapCell | null) =>
  a === null || b === null ? a === b : a.row === b.row && a.col === b.col;

/**
 * Distribución del mapa de PCs del panel (T39a, REQ-001-45): la organiza el administrador y
 * la ve todo el personal. Cada guardado emite `pc.map_changed` con las PCs que cambian.
 */
@Injectable()
export class PcLayoutService {
  constructor(private readonly events: EventsService) {}

  /**
   * Guarda la distribución completa en una transacción: las PCs que no vienen se quedan sin
   * posición. Responde 404 si alguna PC no existe. Sin cambios, no hace nada.
   */
  async save(input: PcMapLayoutRequest, actor: Actor): Promise<void> {
    await this.events.inTransaction(async (tx, emit) => {
      // Bloquea las PCs: si dos administradores guardan a la vez, el segundo espera y parte
      // de lo que dejó el primero.
      const rows = await tx
        .select({ id: pcs.id, name: pcs.name, mapRow: pcs.mapRow, mapCol: pcs.mapCol })
        .from(pcs)
        .orderBy(asc(pcs.name))
        .for('update');
      const known = new Set(rows.map((row) => row.id));
      const wanted = new Map<string, PcMapCell>();
      for (const { pcId, row, col } of input.positions) {
        if (!known.has(pcId)) {
          throw new NotFoundException('Alguna de las PCs ya no existe. Recarga el mapa.');
        }
        wanted.set(pcId, { row, col });
      }

      const changes: Change[] = [];
      for (const row of rows) {
        const from =
          row.mapRow === null || row.mapCol === null ? null : { row: row.mapRow, col: row.mapCol };
        const to = wanted.get(row.id) ?? null;
        if (!sameCell(from, to)) {
          changes.push({ pc: { id: row.id, name: row.name }, from, to });
        }
      }
      if (changes.length === 0) {
        return;
      }

      // Primero se vacían las casillas de las PCs que cambian: así dos PCs se intercambian
      // sin chocar a mitad de camino con el índice único de casilla.
      await tx
        .update(pcs)
        .set({ mapRow: null, mapCol: null })
        .where(
          inArray(
            pcs.id,
            changes.map((change) => change.pc.id),
          ),
        );
      for (const { pc, to } of changes) {
        if (to) {
          await tx.update(pcs).set({ mapRow: to.row, mapCol: to.col }).where(eq(pcs.id, pc.id));
        }
      }
      emit({ type: 'pc.map_changed', version: 1, actor, payload: { changes } });
    });
  }
}
