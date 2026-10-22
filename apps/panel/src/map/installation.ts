// Códigos de instalación de PCs desde el panel (spec 003, T42a; REQ-003-10, CA-003-11), sin
// React. El código es de un uso y caduca a los 10 min; solo vive en el diálogo que lo muestra:
// nunca se guarda en el navegador ni se registra. El nodo valida el rol de nuevo.
import { type PcInstallationCodeResponse, pcInstallationCodeResponseSchema } from '@pope/shared';

import type { ApiClient } from '../api/client.js';
import { countdown } from './model.js';

/** Pide un código: sin `pcId`, para una PC nueva; con él, para registrar de nuevo esa PC. */
export function requestInstallationCode(
  api: ApiClient,
  pcId?: string,
): Promise<PcInstallationCodeResponse> {
  return api.post(
    '/pcs/installation-codes',
    pcId === undefined ? {} : { pcId },
    pcInstallationCodeResponseSchema,
  );
}

/** Cuánto le queda al código: `m:ss` o caducado. */
export type CodeClock = { expired: false; text: string; secondsLeft: number } | { expired: true };

export function codeClock(expiresAt: string, now: Date): CodeClock {
  const left = Math.ceil((Date.parse(expiresAt) - now.getTime()) / 1000);
  return left > 0
    ? { expired: false, text: countdown(left), secondsLeft: left }
    : { expired: true };
}

/** Texto de un fallo al pedir el código; si no hay uno propio, el del nodo. */
export function installationErrorMessage(code: string | null, fallback: string): string {
  switch (code) {
    case 'pc_unavailable':
      return 'Solo se puede registrar de nuevo una PC libre y sin mantenimiento.';
    case 'unknown_pc':
      return 'La PC no existe.';
    default:
      return fallback;
  }
}
