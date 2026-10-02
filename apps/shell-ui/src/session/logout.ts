// Cierre de sesión desde el Shell (T50, REQ-001-26, REQ-001-69). El nodo contesta a `logout`
// con `sessionEnded` o, si la PC ya no tenía sesión, con el `state` bloqueado.
import type { NodeToPcMessage } from '@pope/shared';

import { UNEXPECTED_MESSAGE, withPeriod } from '../lock/login.js';

export type LogoutResult = { ok: true } | { ok: false; message: string };

/** Respuesta del nodo al `logout` con ese `requestId`, o `null` si el mensaje no lo es. */
export function logoutReply(message: NodeToPcMessage, requestId: string): LogoutResult | null {
  if (message.type === 'sessionEnded') return { ok: true };
  if (message.type === 'state' && message.status === 'locked') return { ok: true };
  if (message.type === 'error' && message.requestId === requestId) {
    return message.code === 'internal_error' || message.code === 'invalid_message'
      ? { ok: false, message: UNEXPECTED_MESSAGE }
      : { ok: false, message: withPeriod(message.message) };
  }
  return null;
}
