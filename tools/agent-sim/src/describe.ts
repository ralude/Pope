// Texto en español de lo que le pasa a una PC, para mostrarlo en la consola.
import { formatDuration, formatMoney, type SessionEndReason } from '@pope/shared';

import type { PcEvent } from './simulated-pc.js';

const END_REASONS: Record<SessionEndReason, string> = {
  customer: 'la cerró el cliente',
  staff: 'la cerró el encargado',
  exhausted: 'se agotó el tiempo o el saldo',
  no_heartbeat: 'sin latidos',
};

/** Frase para un evento de la PC, o `null` si no merece una línea. */
export function describeEvent(event: PcEvent): string | null {
  switch (event.kind) {
    case 'connected':
      return 'conectada';
    case 'disconnected':
      return 'desconectada';
    case 'invalid':
      return `mensaje no válido del nodo (${event.reason.slice(0, 80)})`;
    case 'message':
      break;
  }
  const { message } = event;
  switch (message.type) {
    case 'state':
      if (message.status === 'locked') {
        return 'bloqueada';
      }
      return message.session.kind === 'account'
        ? `${message.session.username} · ${formatDuration(message.session.remainingSeconds)} · ${formatMoney(message.session.money.micros)}`
        : `sesión temporal «${message.session.name}» · ${formatDuration(message.session.remainingSeconds)}`;
    case 'warning':
      return `aviso: queda ${String(message.minutesLeft)} min`;
    case 'sessionEnded':
      return `sesión terminada (${END_REASONS[message.reason]})`;
    case 'error':
      return `error ${message.code}: ${message.message}`;
  }
}

/** Hora local `HH:MM:SS` para el principio de cada línea. */
export function clockTime(at: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}
