// Lógica del acceso «Usuario técnico» de la pantalla de bloqueo (spec 003, T38; REQ-003-40).
// El nodo valida a la persona del personal (encargado o administrador) y explica en español por
// qué rechaza; el Shell no ve ni guarda ninguna contraseña de Windows. Aquí solo se traducen sus
// respuestas, igual que `login.ts` con el login del cliente.
import type { ShellMessage } from '../channel/channel.js';
import { withPeriod } from './login.js';

export type TechnicalResult = { ok: true } | { ok: false; message: string };

/**
 * Cuánto se espera la respuesta: el nodo valida (hasta ~1 s) y después la PC prepara Windows,
 * que tarda más que un login de cliente.
 */
export const TECHNICAL_TIMEOUT_MS = 35_000;

export const TECHNICAL_NO_REPLY_MESSAGE = 'La PC no respondió. Inténtalo otra vez.';
export const TECHNICAL_AUTHORIZED_MESSAGE = 'Mantenimiento autorizado. Preparando Windows…';
export const TECHNICAL_UNEXPECTED_MESSAGE = 'Error del servidor. Inténtalo de nuevo.';

// La hora del local, aunque el reloj de Windows de la PC esté en otra zona.
const TIME = new Intl.DateTimeFormat('es-VE', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/Caracas',
});

/** Lo que falta en el formulario antes de enviarlo, o `null` si está completo. */
export function missingTechnicalField(username: string, password: string): string | null {
  if (username.trim() === '') return 'Escribe tu usuario.';
  if (password === '') return 'Escribe tu contraseña.';
  return null;
}

/**
 * Respuesta del nodo a un login técnico con `requestId`: la entrada autorizada (`maintenanceState`
 * con un mantenimiento) o el `technicalError` de esa petición. `null` si el mensaje no la responde.
 */
export function technicalReply(message: ShellMessage, requestId: string): TechnicalResult | null {
  if (message.type === 'maintenanceState') {
    return message.requestId === requestId && message.maintenance !== null ? { ok: true } : null;
  }
  if (message.type !== 'technicalError' || message.requestId !== requestId) return null;
  switch (message.code) {
    case 'technical_login_locked':
      return {
        ok: false,
        message: message.lockedUntil
          ? `Demasiados intentos. Prueba de nuevo a las ${TIME.format(new Date(message.lockedUntil))}.`
          : 'Demasiados intentos. Prueba de nuevo en 1 min.',
      };
    case 'invalid_credentials':
    case 'staff_inactive':
    case 'forbidden':
    case 'pc_unavailable':
      // El nodo los redacta para la persona; solo se les pone el punto final.
      return { ok: false, message: withPeriod(message.message) };
    case 'maintenance_unavailable':
      return { ok: false, message: 'No se pudo preparar el mantenimiento en esta PC.' };
    default:
      return { ok: false, message: TECHNICAL_UNEXPECTED_MESSAGE };
  }
}
