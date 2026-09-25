// Tipo común de la base de datos y datos compartidos por PostgreSQL y PGlite.
import { fileURLToPath } from 'node:url';

import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

import type * as schema from './schema.js';

export type Schema = typeof schema;

/**
 * Base de datos con Drizzle. Es el mismo tipo con el driver `pg` (producción) y con PGlite
 * (tests), así que el código del servidor no depende de cuál se use.
 */
export type Database = PgDatabase<PgQueryResultHKT, Schema>;

/** Base de datos abierta y cómo cerrarla. */
export interface DatabaseHandle {
  db: Database;
  close(): Promise<void>;
}

/** Token de inyección de la base de datos. */
export const DATABASE = Symbol('DATABASE');

/**
 * Carpeta de migraciones SQL generadas por drizzle-kit (`apps/server/drizzle`). Se resuelve
 * igual desde `src/db` (tests) y desde `dist/db` (build).
 */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));
