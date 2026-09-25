// Crea el primer administrador del local (T14c, REQ-001-40). Uso, tras compilar:
//   DATABASE_URL=postgres://… pnpm --filter @pope/server staff:create-admin
// Aplica las migraciones pendientes, pide usuario, nombre y contraseña, y se niega si ya
// hay un administrador activo. La contraseña no se muestra ni se registra en ningún sitio.
import { z } from 'zod';

import { PasswordService } from '../auth/password.service.js';
import { StaffService } from '../auth/staff.service.js';
import { openPostgresDatabase } from '../db/postgres.js';
import { EventsService } from '../events/events.service.js';
import { AdminAlreadyExistsError, createFirstAdmin } from './first-admin.js';
import { createPrompter } from './prompt.js';

const env = z
  .object({ DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }) })
  .safeParse(process.env);
if (!env.success) {
  console.error('Falta DATABASE_URL (p. ej. postgres://pope:clave@127.0.0.1:5432/pope).');
  process.exit(1);
}

const database = await openPostgresDatabase(env.data.DATABASE_URL);
const prompter = createPrompter();
try {
  const passwords = new PasswordService();
  const staff = new StaffService(database.db, new EventsService(database.db), passwords);
  if ((await staff.countActiveAdministrators()) > 0) {
    throw new AdminAlreadyExistsError();
  }

  console.log('Primer administrador de Pope');
  const username = await prompter.ask('Usuario: ');
  const displayName = await prompter.ask('Nombre para mostrar: ');
  const password = await prompter.askHidden('Contraseña: ');
  const repeated = await prompter.askHidden('Repite la contraseña: ');
  if (password !== repeated) {
    throw new Error('Las contraseñas no coinciden.');
  }

  const admin = await createFirstAdmin(staff, { username, displayName, password });
  console.log(`Administrador creado: ${admin.username} (${admin.displayName}).`);
} catch (error) {
  const message = error instanceof z.ZodError ? 'Datos no válidos.' : (error as Error).message;
  console.error(`No se creó el administrador: ${message}`);
  process.exitCode = 1;
} finally {
  prompter.close();
  await database.close();
}
