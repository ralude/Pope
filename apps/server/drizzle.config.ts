import { defineConfig } from 'drizzle-kit';

// drizzle-kit genera las migraciones SQL en ./drizzle a partir del esquema (ADR-0004).
// No se conecta a ninguna base de datos: solo compara el esquema con la última migración.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
