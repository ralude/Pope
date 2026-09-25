import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

import { type DatabaseHandle, MIGRATIONS_FOLDER } from './database.js';
import * as schema from './schema.js';

/**
 * Conexiones máximas del servidor. PostgreSQL admite 20 en el nodo local (ADR-0011) y
 * hay que dejar margen para herramientas de mantenimiento.
 */
const POOL_MAX = 10;

/**
 * Abre PostgreSQL y aplica las migraciones pendientes antes de devolver la conexión
 * (pregunta resuelta de la spec 001: se migra al arrancar el servidor). Así, actualizar el
 * nodo local es copiar el build nuevo y reiniciar el servicio.
 */
export async function openPostgresDatabase(url: string): Promise<DatabaseHandle> {
  const pool = new pg.Pool({ connectionString: url, max: POOL_MAX });
  try {
    const db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    return { db, close: () => pool.end() };
  } catch (error) {
    await pool.end();
    throw error;
  }
}
