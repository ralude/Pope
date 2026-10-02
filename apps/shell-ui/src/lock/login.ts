// Lógica del inicio de sesión del cliente en el Shell (REQ-001-20, REQ-001-52). El nodo
// decide y explica en español por qué rechaza un login (pregunta resuelta de la spec 001);
// el Shell muestra ese texto y solo pone el suyo cuando el fallo es del canal.
import type { NodeToPcMessage } from '@pope/shared';

export type LoginResult = { ok: true } | { ok: false; message: string };

/** Cuánto se espera la respuesta del nodo a un login. */
export const LOGIN_TIMEOUT_MS = 15_000;

export const NO_REPLY_MESSAGE = 'El servidor no contestó. Inténtalo otra vez.';
export const CONNECTION_LOST_MESSAGE = 'Se perdió la conexión con el servidor. Inténtalo otra vez.';
export const UNEXPECTED_MESSAGE = 'No se pudo iniciar sesión. Si se repite, avisa al encargado.';

/** Lo que falta en el formulario antes de enviarlo, o `null` si está completo. */
export function missingField(username: string, password: string): string | null {
  if (username.trim() === '') return 'Escribe tu usuario.';
  if (password === '') return 'Escribe tu contraseña.';
  return null;
}

/**
 * Respuesta del nodo a un login con `requestId`: una sesión activa si entró, o el `error` de
 * esa petición. `null` si el mensaje no responde a ese login (p. ej. un latido).
 */
export function loginReply(message: NodeToPcMessage, requestId: string): LoginResult | null {
  if (message.type === 'state' && message.status === 'active') {
    return { ok: true };
  }
  if (message.type === 'error' && message.requestId === requestId) {
    switch (message.code) {
      case 'invalid_credentials':
      case 'account_locked':
      case 'account_inactive':
      case 'insufficient_balance':
      case 'session_already_active':
        return { ok: false, message: withPeriod(message.message) };
      default:
        return { ok: false, message: UNEXPECTED_MESSAGE };
    }
  }
  return null;
}

/** Los mensajes del nodo no llevan punto final; en el Shell se muestran como frases. */
export function withPeriod(text: string): string {
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}
