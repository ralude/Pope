// Conecta el canal con las pantallas del Shell: el estado de la PC (`feed.ts`) y las
// peticiones que esperan respuesta (login, combos), cada una con su `requestId`.
import type { NodeToPcMessage } from '@pope/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  CONNECTION_LOST_MESSAGE,
  LOGIN_TIMEOUT_MS,
  loginReply,
  type LoginResult,
  NO_REPLY_MESSAGE,
} from '../lock/login.js';
import { type BuyResult, buyReply, type CombosResult, combosReply } from '../session/combos.js';
import type { PcChannel, ShellRequest } from './channel.js';
import { applyEvent, dismissEnded, dismissWarning, INITIAL_FEED, type PcFeed } from './feed.js';

/** Petición enviada al nodo que aún no tiene respuesta. */
interface Pending {
  /** Prueba si el mensaje la responde; si es así, la resuelve y devuelve `true`. */
  answer: (message: NodeToPcMessage) => boolean;
  /** La resuelve como fallida con ese texto. */
  fail: (text: string) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Petición fallida, con el texto para el cliente. */
interface Failure {
  ok: false;
  message: string;
}

export function usePcChannel(channel: PcChannel): {
  feed: PcFeed;
  login: (username: string, password: string) => Promise<LoginResult>;
  /** Pide al nodo los combos a la venta (T49). */
  listCombos: () => Promise<CombosResult>;
  /** Compra un combo con el saldo (T49, REQ-001-85). */
  buyCombo: (comboId: string) => Promise<BuyResult>;
  /** El cliente cierra el aviso de fin de tiempo. */
  closeWarning: () => void;
  /** Se deja de mostrar "Tu sesión terminó" y vuelve el bloqueo. */
  closeEnded: () => void;
} {
  const [feed, setFeed] = useState<PcFeed>(INITIAL_FEED);
  const pending = useRef(new Map<string, Pending>());

  const failAll = useCallback((text: string) => {
    for (const request of [...pending.current.values()]) request.fail(text);
  }, []);

  useEffect(() => {
    channel.start((event) => {
      const now = performance.now();
      setFeed((prev) => applyEvent(prev, event, now));
      if (event.kind === 'status') {
        if (event.status === 'offline') failAll(CONNECTION_LOST_MESSAGE);
        return;
      }
      for (const request of [...pending.current.values()]) request.answer(event.message);
    });
    return () => {
      channel.stop();
      failAll(CONNECTION_LOST_MESSAGE);
    };
  }, [channel, failAll]);

  /**
   * Envía `build(requestId)` y espera el mensaje que `match` reconozca como su respuesta. Si
   * no hay conexión, se corta o el nodo no contesta en 15 s, falla con un texto para el cliente.
   */
  const request = useCallback(
    <T>(
      build: (requestId: string) => ShellRequest,
      match: (message: NodeToPcMessage, requestId: string) => T | null,
    ) =>
      new Promise<T | Failure>((resolve) => {
        const requestId = crypto.randomUUID();
        const finish = (result: T | Failure) => {
          const current = pending.current.get(requestId);
          if (!current) return;
          clearTimeout(current.timer);
          pending.current.delete(requestId);
          resolve(result);
        };
        // Se apunta antes de enviar, por si la respuesta llegara enseguida.
        pending.current.set(requestId, {
          answer: (message) => {
            const reply = match(message, requestId);
            if (reply === null) return false;
            finish(reply);
            return true;
          },
          fail: (text) => {
            finish({ ok: false, message: text });
          },
          timer: setTimeout(() => {
            finish({ ok: false, message: NO_REPLY_MESSAGE });
          }, LOGIN_TIMEOUT_MS),
        });
        if (!channel.send(build(requestId)))
          finish({ ok: false, message: CONNECTION_LOST_MESSAGE });
      }),
    [channel],
  );

  const login = useCallback(
    (username: string, password: string) =>
      request(
        (requestId) => ({ type: 'login', requestId, username: username.trim(), password }),
        loginReply,
      ),
    [request],
  );
  const listCombos = useCallback(
    () => request((requestId) => ({ type: 'listCombos', requestId }), combosReply),
    [request],
  );
  const buyCombo = useCallback(
    (comboId: string) =>
      request((requestId) => ({ type: 'buyCombo', requestId, comboId }), buyReply),
    [request],
  );

  const closeWarning = useCallback(() => {
    setFeed(dismissWarning);
  }, []);
  const closeEnded = useCallback(() => {
    setFeed(dismissEnded);
  }, []);

  return { feed, login, listCombos, buyCombo, closeWarning, closeEnded };
}
