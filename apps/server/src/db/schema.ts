// Esquema de la base de datos con Drizzle (ADR-0004). Cada tarea añade aquí sus tablas y
// genera la migración con `pnpm --filter @pope/server db:generate`.
//
// Convenciones (plan 001): ids UUIDv7, fechas `timestamptz` en UTC, importes `bigint` en
// micro-unidades (ADR-0015) y tiempos en segundos `integer`.
import type { Actor, StaffRole } from '@pope/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

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

/** Personal del local: encargados, administradores y dueño (REQ-001-40). */
export const staff = pgTable(
  'staff',
  {
    id: uuid('id').primaryKey(),
    /** Tal cual lo escribieron; es único sin distinguir mayúsculas. */
    username: text('username').notNull(),
    displayName: text('display_name').notNull(),
    role: text('role').$type<StaffRole>().notNull(),
    /** Hash argon2id (REQ-001-51). */
    passwordHash: text('password_hash').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('staff_username_lower_idx').on(sql`lower(${t.username})`),
    check('staff_role_check', sql`${t.role} in ('encargado', 'administrador', 'dueno')`),
  ],
);
