// Estado de la PC tal como lo cuenta el nodo, para las pantallas del Shell. La PC obedece
// (ADR-0007): bloqueada o en sesión según el último `state`. Función pura, para poder
// probar qué hace el Shell con cada mensaje sin React.
import type { NodeToPcMessage, WarningMinutes } from '@pope/shared';

import type { ChannelEvent, ChannelStatus } from './channel.js';

export type StateMessage = Extract<NodeToPcMessage, { type: 'state' }>;

/** Aviso de fin de tiempo que se está mostrando (REQ-001-24). */
export interface Warning {
  sessionId: string;
  minutesLeft: WarningMinutes;
}

export interface PcFeed {
  status: ChannelStatus;
  /** Último estado que mandó el nodo; `null` hasta la primera respuesta. */
  state: StateMessage | null;
  /** Cuándo llegó `state` (`performance.now()`), para contar el tiempo desde ahí (T47). */
  stateAt: number;
  /** Error del nodo que no responde a ninguna petición (p. ej. PC no registrada). */
  problem: string | null;
  warning: Warning | null;
  /**
   * La sesión acaba de terminar y se muestra "Tu sesión terminó" antes del bloqueo
   * (REQ-001-25). No si la cerró el propio cliente (decisión del mantenedor).
   */
  ended: boolean;
}

export const INITIAL_FEED: PcFeed = {
  status: 'connecting',
  state: null,
  stateAt: 0,
  problem: null,
  warning: null,
  ended: false,
};

const LOCKED: StateMessage = { type: 'state', status: 'locked' };

/**
 * Margen sobre el umbral del aviso: si el restante lo supera (el cliente compró tiempo), el
 * aviso ya no tiene sentido y se quita.
 */
const WARNING_SLACK_SECONDS = 30;

/** El estado tras un evento del canal; `now` es el `performance.now()` de su llegada. */
export function applyEvent(feed: PcFeed, event: ChannelEvent, now: number): PcFeed {
  if (event.kind === 'status') {
    return { ...feed, status: event.status };
  }
  const message = event.message;
  switch (message.type) {
    case 'state':
      return {
        ...feed,
        state: message,
        stateAt: now,
        problem: null,
        warning: stillWarned(feed.warning, message),
        // Si se abre otra sesión (p. ej. una temporal del encargado), se deja de mostrar el fin.
        ended: message.status === 'active' ? false : feed.ended,
      };
    case 'sessionEnded':
      return {
        ...feed,
        state: LOCKED,
        warning: null,
        ended: message.reason !== 'customer',
      };
    case 'warning':
      return {
        ...feed,
        warning: { sessionId: message.sessionId, minutesLeft: message.minutesLeft },
      };
    case 'error':
      return message.requestId === undefined ? { ...feed, problem: message.message } : feed;
  }
}

/** El aviso sigue si es de la sesión activa y el restante no ha vuelto a subir. */
function stillWarned(warning: Warning | null, state: StateMessage): Warning | null {
  if (!warning || state.status !== 'active') return null;
  const { sessionId, remainingSeconds } = state.session;
  if (sessionId !== warning.sessionId) return null;
  return remainingSeconds > warning.minutesLeft * 60 + WARNING_SLACK_SECONDS ? null : warning;
}

/** El cliente cierra el aviso con "Entendido". */
export function dismissWarning(feed: PcFeed): PcFeed {
  return { ...feed, warning: null };
}

/** Pasaron los 10 s de "Tu sesión terminó", o el cliente pulsó "Volver ahora". */
export function dismissEnded(feed: PcFeed): PcFeed {
  return { ...feed, ended: false };
}
