// Estado de la PC tal como lo cuenta el nodo, para las pantallas del Shell. La PC obedece
// (ADR-0007): bloqueada o en sesión según el último `state`. Función pura, para poder
// probar qué hace el Shell con cada mensaje sin React.
import type { NodeToPcMessage } from '@pope/shared';

import type { ChannelEvent, ChannelStatus } from './channel.js';

export type StateMessage = Extract<NodeToPcMessage, { type: 'state' }>;

export interface PcFeed {
  status: ChannelStatus;
  /** Último estado que mandó el nodo; `null` hasta la primera respuesta. */
  state: StateMessage | null;
  /** Cuándo llegó `state` (`performance.now()`), para contar el tiempo desde ahí (T47). */
  stateAt: number;
  /** Error del nodo que no responde a ninguna petición (p. ej. PC no registrada). */
  problem: string | null;
}

export const INITIAL_FEED: PcFeed = {
  status: 'connecting',
  state: null,
  stateAt: 0,
  problem: null,
};

const LOCKED: StateMessage = { type: 'state', status: 'locked' };

/** El estado tras un evento del canal; `now` es el `performance.now()` de su llegada. */
export function applyEvent(feed: PcFeed, event: ChannelEvent, now: number): PcFeed {
  if (event.kind === 'status') {
    return { ...feed, status: event.status };
  }
  const message = event.message;
  switch (message.type) {
    case 'state':
      return { ...feed, state: message, stateAt: now, problem: null };
    case 'sessionEnded':
      return { ...feed, state: LOCKED };
    case 'error':
      return message.requestId === undefined ? { ...feed, problem: message.message } : feed;
    case 'warning':
      return feed;
  }
}
