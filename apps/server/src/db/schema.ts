// Esquema de la base de datos con Drizzle (ADR-0004). Cada tarea añade aquí sus tablas y
// genera la migración con `pnpm --filter @pope/server db:generate`.
//
// Convenciones (plan 001): ids UUIDv7, fechas `timestamptz` en UTC, importes `bigint` en
// micro-unidades (ADR-0015) y tiempos en segundos `integer`.
import type { Actor, CustomerStatus, StaffRole } from '@pope/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
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

/**
 * Sesiones del personal en el panel (pregunta resuelta de la spec 001): la cookie lleva un
 * token aleatorio y aquí solo se guarda su hash. Borrar la fila cierra la sesión.
 */
export const staffSessions = pgTable(
  'staff_sessions',
  {
    id: uuid('id').primaryKey(),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staff.id, { onDelete: 'cascade' }),
    /** SHA-256 del token de la cookie. */
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    /** Se renueva con el uso: 7 días desde la última renovación. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('staff_sessions_staff_id_idx').on(t.staffId)],
);

/**
 * Cuentas de cliente (REQ-001-01, REQ-001-02, REQ-001-04). Se crean solo desde el panel.
 */
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey(),
    /** Tal cual lo escribieron; es único sin distinguir mayúsculas. */
    username: text('username').notNull(),
    /** Hash argon2id (REQ-001-51). */
    passwordHash: text('password_hash').notNull(),
    name: text('name'),
    /** Teléfono venezolano normalizado: +58XXXXXXXXXX. */
    phone: text('phone'),
    status: text('status').$type<CustomerStatus>().notNull().default('active'),
    /** Intentos fallidos seguidos desde el último login correcto o el último bloqueo. */
    failedLogins: integer('failed_logins').notNull().default(0),
    /** Bloqueo temporal por intentos (REQ-001-52): no puede entrar hasta esta hora. */
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('customers_username_lower_idx').on(sql`lower(${t.username})`),
    check('customers_status_check', sql`${t.status} in ('active', 'blocked', 'disabled')`),
  ],
);
