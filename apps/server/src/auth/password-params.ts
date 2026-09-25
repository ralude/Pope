// Parámetros de argon2id (REQ-001-51). Van aparte del servicio para que el script de
// medición (`bench:argon2`) use exactamente los mismos sin cargar NestJS.
import type { Algorithm, Options } from '@node-rs/argon2';

// `Algorithm` es un `const enum` en los tipos del paquete y no se puede usar con
// `isolatedModules`; 2 es su valor para Argon2id.
const ARGON2ID: Algorithm = 2;

/** Mínimos de OWASP para argon2id: 19 MiB de memoria, 2 pasadas, 1 hilo. */
export const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456, // KiB = 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const satisfies Options;
