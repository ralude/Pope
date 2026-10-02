// Estado de la PC tal como lo cuenta el nodo, para las pantallas del Shell. La PC obedece
// (ADR-0007): bloqueada o en sesión según el último `state`.
import type { NodeToPcMessage } from '@pope/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  CONNECTION_LOST_MESSAGE,
  LOGIN_TIMEOUT_MS,
  loginReply,
  type LoginResult,
  NO_REPLY_MESSAGE,
} from '../lock/login.js';
import type { ChannelStatus, PcChannel } from './channel.js';

export type StateMessage = Extract<NodeToPcMessage, { type: 'state' }>;

export interface PcFeed {
  status: ChannelStatus;
  /** Último estado que mandó el nodo; `null` hasta la primera respuesta. */
  state: StateMessage | null;
  /** Error del nodo que no responde a ninguna petición (p. ej. PC no registrada). */
  problem: string | null;
}

interface PendingLogin {
  requestId: string;
  resolve: (result: LoginResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function usePcChannel(channel: PcChannel): {
  feed: PcFeed;
  login: (username: string, password: string) => Promise<LoginResult>;
} {
  const [feed, setFeed] = useState<PcFeed>({ status: 'connecting', state: null, problem: null });
  const pending = useRef<PendingLogin | null>(null);

  const settle = useCallback((result: LoginResult) => {
    const current = pending.current;
    if (!current) return;
    clearTimeout(current.timer);
    pending.current = null;
    current.resolve(result);
  }, []);

  useEffect(() => {
    channel.start((event) => {
      if (event.kind === 'status') {
        setFeed((prev) => ({ ...prev, status: event.status }));
        if (event.status === 'offline') settle({ ok: false, message: CONNECTION_LOST_MESSAGE });
        return;
      }
      const message = event.message;
      if (pending.current) {
        const reply = loginReply(message, pending.current.requestId);
        if (reply) settle(reply);
      }
      if (message.type === 'state') {
        setFeed((prev) => ({ ...prev, state: message, problem: null }));
      } else if (message.type === 'sessionEnded') {
        setFeed((prev) => ({ ...prev, state: { type: 'state', status: 'locked' } }));
      } else if (message.type === 'error' && message.requestId === undefined) {
        setFeed((prev) => ({ ...prev, problem: message.message }));
      }
    });
    return () => {
      channel.stop();
      settle({ ok: false, message: CONNECTION_LOST_MESSAGE });
    };
  }, [channel, settle]);

  const login = useCallback(
    (username: string, password: string) =>
      new Promise<LoginResult>((resolve) => {
        if (pending.current) {
          resolve({ ok: false, message: 'Ya se está iniciando sesión.' });
          return;
        }
        const requestId = crypto.randomUUID();
        const timer = setTimeout(() => {
          settle({ ok: false, message: NO_REPLY_MESSAGE });
        }, LOGIN_TIMEOUT_MS);
        // Se apunta antes de enviar, por si la respuesta llegara enseguida.
        pending.current = { requestId, resolve, timer };
        const sent = channel.send({
          type: 'login',
          requestId,
          username: username.trim(),
          password,
        });
        if (!sent) settle({ ok: false, message: CONNECTION_LOST_MESSAGE });
      }),
    [channel, settle],
  );

  return { feed, login };
}
