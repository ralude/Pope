// Ejecuta los tests del servidor contra un PostgreSQL real en vez de PGlite (ADR-0004,
// plan 001 "Riesgos"). Cada base de datos de test se crea y se borra sola.
//   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres pnpm --filter @pope/server test:pg
// El usuario necesita permiso para crear bases de datos (CREATEDB).
import { spawnSync } from 'node:child_process';
import console from 'node:console';
import process from 'node:process';

if (!process.env.TEST_DATABASE_URL) {
  console.error('Falta TEST_DATABASE_URL (p. ej. postgres://postgres@127.0.0.1:5432/postgres).');
  process.exit(1);
}

const result = spawnSync('vitest', ['run'], { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
