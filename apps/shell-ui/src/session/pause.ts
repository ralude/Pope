// Pausa de la sesión desde el Shell (spec 002, T15): respuestas del nodo a `pause` y `resume`.
// El nodo decide si se puede pausar (ADR-0007); el Shell solo muestra lo que dice el `state`.
import { type NodeToPcMessage, PAUSE_REFUSAL_MESSAGES, type SessionState } from '@pope/shared';

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

/**
 * El botón Pausar de la barra (REQ-002-01): no aparece en una sesión temporal (CA-002-07); si no
 * quedan pausas o la pausa está desactivada, se ve apagado con el motivo al lado (CA-002-04,
 * CA-002-06, REQ-002-23; mantenedor, 2026-10-03).
 */
export function pauseButton(session: SessionState): {
  visible: boolean;
  blocked: boolean;
  reason: string | null;
} {
  if (session.kind !== 'account') return { visible: false, blocked: true, reason: null };
  const limit = session.pauseLimit ?? null;
  if (limit !== null)
    return { visible: true, blocked: true, reason: PAUSE_REFUSAL_MESSAGES[limit] };
  // Un nodo que no manda las pausas que quedan no sabe pausar: el botón queda apagado.
  const left = session.pausesLeft ?? 0;
  return { visible: true, blocked: left === 0, reason: null };
}

/** «Te quedan 2 pausas» o «Te queda 1 pausa» (REQ-002-02). */
export function pausesLeftText(left: number): string {
  return left === 1 ? 'Te queda 1 pausa' : `Te quedan ${String(left)} pausas`;
}

/** Duración máxima de una pausa para la confirmación: `15 min` (REQ-002-20). */
export function pauseMaxText(maxSeconds: number): string {
  return `${String(Math.round(maxSeconds / 60))} min`;
}

/**
 * Tiempo de pausa que queda, para la pantalla de pausa (REQ-002-06): sin segundos y hacia
 * arriba («12 min»), salvo el último minuto, que cuenta en segundos («45 s»).
 */
export function formatPauseLeft(seconds: number): string {
  const left = Math.max(0, Math.ceil(seconds));
  return left > 60 ? `${String(Math.ceil(left / 60))} min` : `${String(left)} s`;
}
