// Lógica de la pestaña «Técnico» (spec 003, T38b; REQ-003-42, REQ-003-44). Mientras hay un
// mantenimiento, el Shell muestra una pestaña plegada con la PC, quién entró y «Terminar y
// bloquear». Nunca muestra el tiempo transcurrido: la duración solo se registra en el evento de
// salida. Perder la conexión no quita la pestaña (el modo técnico continúa sin red).
import type { PcMaintenance } from '@pope/shared';

import type { EndMaintenanceRequest, ShellMessage } from '../channel/channel.js';
import { withPeriod } from '../lock/login.js';
import { type TechnicalResult } from '../lock/technical.js';

/** La PC cierra el entorno, bloquea y guarda la salida: más que un login, menos que Windows. */
export const END_TIMEOUT_MS = 35_000;

export const END_NO_REPLY_MESSAGE = 'La PC no respondió. Inténtalo otra vez.';
export const END_FAILED_MESSAGE = 'No se pudo terminar el mantenimiento. Inténtalo otra vez.';

/** Textos de la pestaña, o `null` si no hay mantenimiento y no se muestra. */
export function tabText(
  maintenance: PcMaintenance | null,
): { pc: string; who: string; summary: string } | null {
  if (!maintenance) return null;
  const who = maintenance.actor.name;
  return {
    pc: maintenance.pc.name,
    who,
    summary: `${maintenance.pc.name} · en mantenimiento por ${who}`,
  };
}

/** Petición de salida local; la atiende el agente, no el nodo. */
export function endRequest(maintenanceId: string, requestId: string): EndMaintenanceRequest {
  return { type: 'endMaintenance', requestId, maintenanceId };
}

/**
 * Respuesta del agente a «Terminar y bloquear»: el mantenimiento vacío con su `requestId`, o
 * el `error` de esa petición. `null` si el mensaje no la responde.
 */
export function endReply(message: ShellMessage, requestId: string): TechnicalResult | null {
  if (message.type === 'maintenanceState') {
    return message.requestId === requestId && message.maintenance === null ? { ok: true } : null;
  }
  if (message.type === 'error' && message.requestId === requestId) {
    return { ok: false, message: withPeriod(message.message) };
  }
  return null;
}
