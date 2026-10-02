// Conecta el canal con las pantallas del Shell: el estado de la PC (`feed.ts`) y las
// peticiones que esperan respuesta, como el login.
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  CONNECTION_LOST_MESSAGE,
  LOGIN_TIMEOUT_MS,
  loginReply,
  type LoginResult,
  NO_REPLY_MESSAGE,
} from '../lock/login.js';
import type { PcChannel } from './channel.js';
import { applyEvent, INITIAL_FEED, type PcFeed } from './feed.js';

interface PendingLogin {
  requestId: string;
  resolve: (result: LoginResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function usePcChannel(channel: PcChannel): {
  feed: PcFeed;
  login: (username: string, password: string) => Promise<LoginResult>;
} {
  const [feed, setFeed] = useState<PcFeed>(INITIAL_FEED);
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
      const now = performance.now();
      setFeed((prev) => applyEvent(prev, event, now));
      if (event.kind === 'status') {
        if (event.status === 'offline') settle({ ok: false, message: CONNECTION_LOST_MESSAGE });
      } else if (pending.current) {
        const reply = loginReply(event.message, pending.current.requestId);
        if (reply) settle(reply);
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
