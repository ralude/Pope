// Crea las PCs de ejemplo para desarrollo ("PC 01" … "PC 10"). Uso, tras compilar:
//   DATABASE_URL=postgres://… pnpm --filter @pope/server dev:seed-pcs
// Solo para desarrollo: en el local las PCs se registrarán con la spec 003.
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

const database = await openPostgresDatabase(env.data.DATABASE_URL);
try {
  const created = await seedDevPcs(database.db);
  console.log(
    `PCs de ejemplo: ${String(created)} creadas, ${String(DEV_PC_COUNT - created)} ya existían.`,
  );
} finally {
  await database.close();
}
