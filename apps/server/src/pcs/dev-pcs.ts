// PCs de ejemplo para desarrollo y para el simulador (T36). El registro real de las PCs,
// con código de instalación, es la spec 003.
import type { Database } from '../db/database.js';
import { pcs } from '../db/schema.js';

/** Cuántas PCs de ejemplo se crean: "PC 01" … "PC 10". */
export const DEV_PC_COUNT = 10;

/**
 * Id fijo de la PC de ejemplo número `n` (1…99), un UUIDv7 válido. Así el simulador sabe
 * los ids sin consultar la base de datos.
 */
export function devPcId(n: number): string {
  return `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;
}

/** Nombre de la PC de ejemplo número `n`: "PC 05". */
export function devPcName(n: number): string {
  return `PC ${String(n).padStart(2, '0')}`;
}

/** Crea las PCs de ejemplo que falten. Se puede ejecutar varias veces. */
export async function seedDevPcs(db: Database): Promise<number> {
  const rows = Array.from({ length: DEV_PC_COUNT }, (_, i) => ({
    id: devPcId(i + 1),
    name: devPcName(i + 1),
  }));
  const inserted = await db.insert(pcs).values(rows).onConflictDoNothing().returning();
  return inserted.length;
}
