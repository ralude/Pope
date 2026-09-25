// Configuración del servidor, leída de las variables de entorno y validada con zod al
// arrancar (AGENTS.md: toda entrada externa se valida). Si falta algo, el servidor no
// arranca y dice qué variable revisar.
import { z } from 'zod';

/** Modo del servidor (ADR-0003): el mismo código corre en el nodo local o en la nube. */
export const popeModeSchema = z.enum(['local', 'cloud']);
export type PopeMode = z.infer<typeof popeModeSchema>;

const configSchema = z.object({
  // Obligatorio: nunca se arranca en un modo por accidente.
  POPE_MODE: popeModeSchema,
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  // Por defecto escucha en todas las interfaces: las PCs llegan por la LAN.
  HOST: z.string().min(1).default('0.0.0.0'),
  // Cadena de conexión de PostgreSQL, p. ej. postgres://pope:clave@127.0.0.1:5432/pope.
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

export interface AppConfig {
  mode: PopeMode;
  port: number;
  host: string;
  databaseUrl: string;
}

/** Token de inyección de la configuración. */
export const APP_CONFIG = Symbol('APP_CONFIG');

/** Lee y valida la configuración. Lanza un error en español con cada variable inválida. */
export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración no válida:\n${problems}`);
  }
  const { POPE_MODE, PORT, HOST, DATABASE_URL } = result.data;
  return { mode: POPE_MODE, port: PORT, host: HOST, databaseUrl: DATABASE_URL };
}
