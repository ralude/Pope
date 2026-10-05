// Conserva SQL/journal previos para verificar upgrades reales, también en PostgreSQL.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import { type DatabaseHandle, MIGRATIONS_FOLDER } from '../db/database.js';
import { createTestDatabase } from './database.js';

interface Journal {
  entries: { tag: string }[];
}

export async function createDatabaseBeforeMigration(tag: string): Promise<DatabaseHandle> {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8'),
  ) as Journal;
  const position = journal.entries.findIndex((entry) => entry.tag === tag);
  if (position < 0) throw new Error(`Migración desconocida: ${tag}`);
  const entries = journal.entries.slice(0, position);
  const root = resolve(tmpdir());
  const folder = mkdtempSync(join(root, 'pope-migrations-'));
  // Verificar el destino absoluto antes de cualquier borrado recursivo en Windows.
  if (dirname(resolve(folder)) !== root || !basename(folder).startsWith('pope-migrations-')) {
    throw new Error('Destino temporal inesperado');
  }
  try {
    mkdirSync(join(folder, 'meta'));
    writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }));
    for (const entry of entries)
      copyFileSync(join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
    return await createTestDatabase(folder);
  } finally {
    rmSync(folder, { recursive: true });
  }
}
