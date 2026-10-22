// Configuración del servidor, leída de las variables de entorno y validada con zod al
// arrancar (AGENTS.md: toda entrada externa se valida). Si falta algo, el servidor no
// arranca y dice qué variable revisar.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

/** Carpeta del paquete del servidor (`apps/server`), tanto desde `src` como desde `dist`. */
const SERVER_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Modo del servidor (ADR-0003): el mismo código corre en el nodo local o en la nube. */
export const popeModeSchema = z.enum(['local', 'cloud']);
export type PopeMode = z.infer<typeof popeModeSchema>;

const configSchema = z
  .object({
    // Obligatorio: nunca se arranca en un modo por accidente.
    POPE_MODE: popeModeSchema,
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    // Por defecto escucha en todas las interfaces: las PCs llegan por la LAN.
    HOST: z.string().min(1).default('0.0.0.0'),
    // Cadena de conexión de PostgreSQL, p. ej. postgres://pope:clave@127.0.0.1:5432/pope.
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    // Opcional: cada cuántos ms se registra la memoria del proceso (prueba de carga, ADR-0011).
    // Ausente = desactivado. Mínimo 1000 para no llenar el log.
    POPE_MEMORY_LOG_MS: z.coerce.number().int().min(1000).optional(),
    // Opcional: carpeta donde el nodo guarda sus archivos, como las fotos de los productos
    // (spec 005). Por defecto, `data/` junto al servidor.
    POPE_DATA_DIR: z.string().min(1).optional(),
    POPE_TLS_CERT_FILE: z.string().min(1).optional(),
    POPE_TLS_KEY_FILE: z.string().min(1).optional(),
    // Wake-on-LAN (T33, REQ-003-22): dirección de difusión y puerto UDP del paquete mágico.
    POPE_WOL_ADDRESS: z.ipv4().default('255.255.255.255'),
    POPE_WOL_PORT: z.coerce.number().int().min(1).max(65_535).default(9),
  })
  .superRefine((config, context) => {
    if (Boolean(config.POPE_TLS_CERT_FILE) !== Boolean(config.POPE_TLS_KEY_FILE)) {
      context.addIssue({
        code: 'custom',
        path: ['POPE_TLS_CERT_FILE', 'POPE_TLS_KEY_FILE'],
        message: 'Configura juntos el certificado y la clave TLS',
      });
    }
  });

export interface AppConfig {
  mode: PopeMode;
  port: number;
  host: string;
  databaseUrl: string;
  /** Cada cuántos ms se registra la memoria del proceso; `null` si está desactivado. */
  memoryLogMs: number | null;
  /** Carpeta de datos del nodo, ruta absoluta (fotos de los productos, REQ-005-03). */
  dataDir: string;
  /** PEM del nodo (ADR-0017); null solo en HTTP de desarrollo o tras proxy cloud. */
  tls: { certFile: string; keyFile: string } | null;
  /** Destino del paquete mágico de Wake-on-LAN (REQ-003-22). */
  wakeOnLan: { address: string; port: number };
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
  const {
    POPE_MODE,
    PORT,
    HOST,
    DATABASE_URL,
    POPE_MEMORY_LOG_MS,
    POPE_DATA_DIR,
    POPE_TLS_CERT_FILE,
    POPE_TLS_KEY_FILE,
    POPE_WOL_ADDRESS,
    POPE_WOL_PORT,
  } = result.data;
  return {
    mode: POPE_MODE,
    port: PORT,
    host: HOST,
    databaseUrl: DATABASE_URL,
    memoryLogMs: POPE_MEMORY_LOG_MS ?? null,
    // Una ruta relativa se toma desde la carpeta en que se arranca el nodo.
    dataDir: resolve(POPE_DATA_DIR ?? resolve(SERVER_ROOT, 'data')),
    tls:
      POPE_TLS_CERT_FILE && POPE_TLS_KEY_FILE
        ? { certFile: resolve(POPE_TLS_CERT_FILE), keyFile: resolve(POPE_TLS_KEY_FILE) }
        : null,
    wakeOnLan: { address: POPE_WOL_ADDRESS, port: POPE_WOL_PORT },
  };
}
