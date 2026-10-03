import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { newId } from '@pope/shared';
import { count } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
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

  it('T28b: 0022 pasa las líneas de concepto a otros ingresos antes de borrar los conceptos (REQ-005-05)', async () => {
    // Las migraciones hasta la 0021, en una carpeta aparte, y después todas.
    const before = mkdtempSync(join(tmpdir(), 'pope-migrations-'));
    try {
      const upTo = journal.entries.findIndex((entry) => entry.tag === '0022_drop_sale_concepts');
      cpSync(MIGRATIONS_FOLDER, before, { recursive: true });
      writeFileSync(
        join(before, 'meta', '_journal.json'),
        JSON.stringify({ ...journal, entries: journal.entries.slice(0, upTo) }),
      );
      const client = new PGlite();
      const db = drizzle({ client });
      handle = { db: db as unknown as DatabaseHandle['db'], close: () => client.close() };
      await migrate(db, { migrationsFolder: before });
      const [staff, shift, concept, sale, line] = [newId(), newId(), newId(), newId(), newId()];
      // Con PGlite aunque se pruebe contra PostgreSQL: solo se mira la migración.
      await client.exec(`
        INSERT INTO staff (id, username, display_name, role, password_hash)
          VALUES ('${staff}', 'ana', 'Ana', 'encargado', 'x');
        INSERT INTO cash_shifts (id, staff_id, opened_at) VALUES ('${shift}', '${staff}', now());
        INSERT INTO sale_concepts (id, name, unit_price_micros, created_at)
          VALUES ('${concept}', 'Impresiones', 100000, now());
        INSERT INTO sales (id, shift_id, total_micros, actor, created_at)
          VALUES ('${sale}', '${shift}', 1200000, '{"kind":"system"}', now());
        INSERT INTO sale_lines (id, sale_id, position, kind, concept_id, name, quantity, unit_price_micros, total_micros)
          VALUES ('${line}', '${sale}', 0, 'concept', '${concept}', 'Impresiones', 12, 100000, 1200000);
      `);
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
      const { rows } = await client.query(
        `SELECT kind, name, quantity, unit_price_micros::int AS unit_price_micros, total_micros::int AS total_micros, comment FROM sale_lines`,
      );
      expect(rows).toEqual([
        {
          kind: 'other',
          name: 'Otro ingreso',
          quantity: 1,
          unit_price_micros: 1_200_000,
          total_micros: 1_200_000,
          comment: 'Impresiones × 12',
        },
      ]);
      const { rows: tables } = await client.query(
        `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'sale_concepts'`,
      );
      expect(tables).toEqual([{ n: 0 }]);
    } finally {
      rmSync(before, { recursive: true, force: true });
    }
  });

  it('crea la base de datos y aplica todas las migraciones', async () => {
    handle = await createTestDatabase();
    const [row] = await handle.db.select({ applied: count() }).from(appliedMigrations);
    expect(journal.entries.length).toBeGreaterThan(0);
    expect(row?.applied).toBe(journal.entries.length);
  });
});
