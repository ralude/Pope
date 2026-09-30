// PCs de ejemplo para desarrollo y para el simulador (T36). El registro real de las PCs,
// con código de instalación, es la spec 003. Los ids y nombres están en `@pope/shared`,
// para que el simulador use los mismos.
import { devPcId, devPcName, MAX_DEV_PCS } from '@pope/shared';

import type { Database } from '../db/database.js';
import { pcs } from '../db/schema.js';

export { devPcId, devPcName };

/** Cuántas PCs de ejemplo se crean por defecto: "PC 01" … "PC 10". */
export const DEV_PC_COUNT = 10;

/**
 * Crea las PCs de ejemplo "PC 01" … "PC NN" que falten (`count` de 1 a 99, por defecto 10).
 * Devuelve cuántas creó. Se puede ejecutar varias veces.
 */
export async function seedDevPcs(db: Database, count = DEV_PC_COUNT): Promise<number> {
  if (!Number.isInteger(count) || count < 1 || count > MAX_DEV_PCS) {
    throw new RangeError(
      `Cantidad de PCs no válida: ${String(count)} (de 1 a ${String(MAX_DEV_PCS)})`,
    );
  }
  const rows = Array.from({ length: count }, (_, i) => ({
    id: devPcId(i + 1),
    name: devPcName(i + 1),
  }));
  const inserted = await db.insert(pcs).values(rows).onConflictDoNothing().returning();
  return inserted.length;
}
