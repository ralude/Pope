// Pausa de la sesión desde el Shell (spec 002, T15): respuestas del nodo a `pause` y `resume`.
// El nodo decide si se puede pausar (ADR-0007); el Shell solo muestra lo que dice el `state`.
import type { NodeToPcMessage } from '@pope/shared';

import { withPeriod } from '../lock/login.js';

export type PauseResult = { ok: true } | { ok: false; message: string };

/** Texto si el nodo falla de forma inesperada al pausar o al reanudar. */
export const PAUSE_FAILED_MESSAGE = 'No se pudo pausar. Si se repite, avisa al encargado.';
export const RESUME_FAILED_MESSAGE = 'No se pudo reanudar. Si se repite, avisa al encargado.';

/**
 * Respuesta del nodo a `pause` o `resume` con ese `requestId`: el `state` que la lleva, o el
 * `error` con su motivo (p. ej. «Sin pausas disponibles hoy»). `null` si no lo es.
 */
export function pauseReply(
  message: NodeToPcMessage,
  requestId: string,
  unexpected = PAUSE_FAILED_MESSAGE,
): PauseResult | null {
  if (message.type === 'state' && message.status === 'active' && message.requestId === requestId) {
    return { ok: true };
  }
  if (message.type === 'error' && message.requestId === requestId) {
    return message.code === 'internal_error' || message.code === 'invalid_message'
      ? { ok: false, message: unexpected }
      : { ok: false, message: withPeriod(message.message) };
  }
  return null;
}
