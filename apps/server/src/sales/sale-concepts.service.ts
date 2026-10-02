import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type Actor,
  micros,
  newId,
  type SaleConcept,
  type SaleConceptCreateRequest,
  type SaleConceptUpdateRequest,
} from '@pope/shared';
import { asc, desc, eq, sql } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { saleConcepts } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';

type ConceptRow = typeof saleConcepts.$inferSelect;

export function toSaleConcept(row: ConceptRow): SaleConcept {
  return {
    id: row.id,
    name: row.name,
    unitPriceMicros: micros(row.unitPriceMicros),
    active: row.active,
  };
}

/** Datos del concepto en los eventos `sale_concept.created` y `sale_concept.updated`. */
function eventData(row: Pick<ConceptRow, 'name' | 'unitPriceMicros' | 'active'>) {
  return {
    name: row.name,
    unitPrice: { micros: micros(row.unitPriceMicros), currency: 'USD' as const },
    active: row.active,
  };
}

/**
 * Conceptos que se venden sin inventario, como "Impresiones" (REQ-005-05): el administrador
 * los da de alta y los edita; todo el personal los ve.
 */
@Injectable()
export class SaleConceptsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly clock: Clock,
  ) {}

  /** Todos los conceptos: primero los activos y, dentro, por nombre. */
  async list(): Promise<SaleConcept[]> {
    const rows = await this.db
      .select()
      .from(saleConcepts)
      .orderBy(desc(saleConcepts.active), asc(sql`lower(${saleConcepts.name})`));
    return rows.map(toSaleConcept);
  }

  /** Da de alta un concepto activo y emite `sale_concept.created`. */
  async create(input: SaleConceptCreateRequest, actor: Actor): Promise<SaleConcept> {
    return this.events.inTransaction(async (tx, emit) => {
      const [created] = await tx
        .insert(saleConcepts)
        .values({ id: newId(), ...input, createdAt: this.clock.now() })
        .returning();
      if (!created) {
        throw new Error('No se pudo crear el concepto');
      }
      emit({
        type: 'sale_concept.created',
        version: 1,
        actor,
        payload: { conceptId: created.id, concept: eventData(created) },
      });
      return toSaleConcept(created);
    });
  }

  /**
   * Edita o desactiva un concepto y emite `sale_concept.updated` con los valores anteriores
   * y los nuevos. Sin cambios, no emite nada.
   */
  async update(id: string, input: SaleConceptUpdateRequest, actor: Actor): Promise<SaleConcept> {
    return this.events.inTransaction(async (tx, emit) => {
      const [before] = await tx
        .select()
        .from(saleConcepts)
        .where(eq(saleConcepts.id, id))
        .for('update');
      if (!before) {
        throw new NotFoundException('No existe ese concepto');
      }
      const after = { ...before, ...input };
      const changed = (['name', 'unitPriceMicros', 'active'] as const).some(
        (field) => after[field] !== before[field],
      );
      if (changed) {
        await tx.update(saleConcepts).set(input).where(eq(saleConcepts.id, id));
        emit({
          type: 'sale_concept.updated',
          version: 1,
          actor,
          payload: { conceptId: id, before: eventData(before), after: eventData(after) },
        });
      }
      return toSaleConcept(after);
    });
  }
}
