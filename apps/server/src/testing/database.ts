// Base de datos para los tests (ADR-0004, plan 001 "Riesgos").
//
// Por defecto usa PGlite: PostgreSQL compilado a WASM, en memoria y sin Docker. Con la
// variable TEST_DATABASE_URL (script `test:pg`) usa un PostgreSQL real: crea una base
// temporal, aplica las migraciones y la borra al cerrar. Solo se usa en tests.
import { randomUUID } from 'node:crypto';

import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import pg from 'pg';

import { type DatabaseHandle, MIGRATIONS_FOLDER } from '../db/database.js';
import { openPostgresDatabase } from '../db/postgres.js';
import * as schema from '../db/schema.js';

/** Crea una base de datos vacía con todas las migraciones aplicadas. */
export async function createTestDatabase(): Promise<DatabaseHandle> {
  const adminUrl = process.env.TEST_DATABASE_URL;
  return adminUrl ? createPostgresTestDatabase(adminUrl) : createPgliteTestDatabase();
}

async function createPgliteTestDatabase(): Promise<DatabaseHandle> {
  const client = new PGlite();
  const db = drizzlePglite({ client, schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, close: () => client.close() };
}

async function createPostgresTestDatabase(adminUrl: string): Promise<DatabaseHandle> {
  const name = `pope_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    // El nombre lo genera el propio test (solo letras, números y _), no viene de fuera.
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const handle = await openPostgresDatabase(url.toString());
  return {
    db: handle.db,
    close: async () => {
      await handle.close();
      const cleaner = new pg.Client({ connectionString: adminUrl });
      await cleaner.connect();
      try {
        await cleaner.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await cleaner.end();
      }
    },
  };
}
