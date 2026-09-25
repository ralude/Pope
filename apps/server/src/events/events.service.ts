import { Inject, Injectable } from '@nestjs/common';
import { type DomainEvent, domainEventSchema, newId } from '@pope/shared';
import { sql } from 'drizzle-orm';

import { DATABASE, type Database } from '../db/database.js';
import { events } from '../db/schema.js';

/** Transacción de Drizzle, la que recibe el trabajo de `inTransaction`. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** `Omit` que respeta cada variante de una unión (cada tipo de evento con su payload). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Evento a emitir: el servicio le pone el `id` y la hora (`occurredAt`). */
export type NewDomainEvent = DistributiveOmit<DomainEvent, 'id' | 'occurredAt'>;

/** Registra un evento que se guardará al final de la transacción. */
export type Emit = (event: NewDomainEvent) => void;

/**
 * Clave del bloqueo que ordena la escritura de eventos. Es un número arbitrario, fijo y
 * propio de Pope.
 */
const EVENTS_LOCK_KEY = 7_001_001;

/**
 * Ejecuta cambios de estado junto con sus eventos en una sola transacción (REQ-001-30,
 * ADR-0008): o se guardan los cambios y sus eventos, o no se guarda nada.
 */
@Injectable()
export class EventsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Ejecuta `work` en una transacción. Los eventos que emita se validan y se insertan al
   * final, dentro de la misma transacción. Si `work` lanza un error o un evento no es
   * válido, se deshace todo.
   */
  inTransaction<T>(work: (tx: Transaction, emit: Emit) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      const pending: DomainEvent[] = [];
      const emit: Emit = (event) => {
        // Se valida al emitir para que el error señale el lugar exacto del código.
        pending.push(
          domainEventSchema.parse({ ...event, id: newId(), occurredAt: new Date().toISOString() }),
        );
      };

      const result = await work(tx, emit);

      if (pending.length > 0) {
        // Bloqueo exclusivo hasta el final de la transacción: así `seq` se asigna en el
        // mismo orden en que se confirman las transacciones y el envío a la nube, que
        // avanza por `seq`, nunca se salta un evento confirmado más tarde (ADR-0008).
        await tx.execute(sql`select pg_advisory_xact_lock(${EVENTS_LOCK_KEY})`);
        await tx.insert(events).values(
          pending.map((event) => ({
            id: event.id,
            type: event.type,
            version: event.version,
            actor: event.actor,
            occurredAt: new Date(event.occurredAt),
            payload: event.payload,
          })),
        );
      }
      return result;
    });
  }
}
