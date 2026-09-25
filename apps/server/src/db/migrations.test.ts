import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { count } from 'drizzle-orm';
import { pgSchema, serial } from 'drizzle-orm/pg-core';
import { afterEach, describe, expect, it } from 'vitest';

import { createTestDatabase } from '../testing/database.js';
import { type DatabaseHandle, MIGRATIONS_FOLDER } from './database.js';

interface Journal {
  entries: { tag: string }[];
}

/** Tabla donde Drizzle registra las migraciones aplicadas. */
const appliedMigrations = pgSchema('drizzle').table('__drizzle_migrations', {
  id: serial('id').primaryKey(),
});

const journal = JSON.parse(
  readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8'),
) as Journal;

describe('migraciones (ADR-0004)', () => {
  let handle: DatabaseHandle | undefined;

  afterEach(async () => {
    await handle?.close();
    handle = undefined;
  });

  it('crea la base de datos y aplica todas las migraciones', async () => {
    handle = await createTestDatabase();
    const [row] = await handle.db.select({ applied: count() }).from(appliedMigrations);
    expect(journal.entries.length).toBeGreaterThan(0);
    expect(row?.applied).toBe(journal.entries.length);
  });
});
