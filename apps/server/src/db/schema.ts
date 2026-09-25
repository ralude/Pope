// Esquema de la base de datos con Drizzle (ADR-0004). Cada tarea añade aquí sus tablas y
// genera la migración con `pnpm --filter @pope/server db:generate`.
//
// Convenciones (plan 001): ids UUIDv7, fechas `timestamptz` en UTC, importes `bigint` en
// micro-unidades (ADR-0015) y tiempos en segundos `integer`.
import type { Actor } from '@pope/shared';
import { bigint, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Eventos inmutables de auditoría y sincronización (REQ-001-30, ADR-0008). Se escriben en
 * la misma transacción que el cambio que describen y nunca se modifican, salvo `sent_at`,
 * que marca el envío a la nube (spec 006).
 */
export const events = pgTable('events', {
  /** Id del evento (UUIDv7). La nube lo usa para insertar de forma idempotente. */
  id: uuid('id').primaryKey(),
  /** Orden de los eventos en este nodo: coincide con el orden en que se confirmaron. */
  seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity().unique().notNull(),
  type: text('type').notNull(),
  version: integer('version').notNull(),
  actor: jsonb('actor').$type<Actor>().notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
});
