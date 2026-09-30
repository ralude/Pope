// Crea las PCs de ejemplo para desarrollo ("PC 01" … "PC NN"). Uso, tras compilar:
//   DATABASE_URL=postgres://… pnpm --filter @pope/server dev:seed-pcs [-- --count 40]
// `--count` es el número de PCs, de 1 a 99 (por defecto 10).
// Solo para desarrollo: en el local las PCs se registrarán con la spec 003.
import { parseArgs } from 'node:util';

import { MAX_DEV_PCS } from '@pope/shared';
import { z } from 'zod';

import { openPostgresDatabase } from '../db/postgres.js';
import { DEV_PC_COUNT, seedDevPcs } from '../pcs/dev-pcs.js';

const env = z
  .object({ DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }) })
  .safeParse(process.env);
if (!env.success) {
  console.error('Falta DATABASE_URL (p. ej. postgres://pope:clave@127.0.0.1:5432/pope).');
  process.exit(1);
}

const { values } = parseArgs({ options: { count: { type: 'string' } }, allowPositionals: false });
const count = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_DEV_PCS)
  .default(DEV_PC_COUNT)
  .safeParse(values.count);
if (!count.success) {
  console.error(`--count debe ser un número entero de 1 a ${String(MAX_DEV_PCS)}.`);
  process.exit(1);
}

const database = await openPostgresDatabase(env.data.DATABASE_URL);
try {
  const created = await seedDevPcs(database.db, count.data);
  console.log(
    `PCs de ejemplo: ${String(created)} creadas, ${String(count.data - created)} ya existían.`,
  );
} finally {
  await database.close();
}
