// Canal en vivo del panel (T38a): el nodo envía el mapa completo al conectar y cada vez que
// algo cambia. Si se corta, se reconecta solo; con 4401 la sesión del personal ya no vale.
import {
  PANEL_CHANNEL_PATH,
  PANEL_UNAUTHORIZED_CLOSE,
  type PanelMessage,
  panelMessageSchema,
  type PcMap,
} from '@pope/shared';
import { useEffect, useState } from 'react';

import { useSession } from '../session.js';

/** Espera antes de reconectar: el nodo puede estar reiniciándose tras un apagón. */
export const RECONNECT_MS = 2000;

/** Lee un mensaje del canal; `null` si no es JSON o no cumple el esquema. */
export function parsePanelMessage(data: unknown): PanelMessage | null {
  if (typeof data !== 'string') {
    return null;
  }
  try {
    const parsed = panelMessageSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface PcMapFeed {
  map: PcMap | null;
  /** Hay canal abierto con el nodo. Sin él, el mapa mostrado puede estar desfasado. */
  live: boolean;
  /**
   * Reloj del nodo menos el del navegador, en ms. El restante se cuenta con el reloj del
   * nodo, que es el que cobra (ADR-0007), aunque el navegador vaya adelantado o atrasado.
   */
  skewMs: number;
}

export function usePcMapFeed(): PcMapFeed {
  const { expire } = useSession();
  const [feed, setFeed] = useState<PcMapFeed>({ map: null, live: false, skewMs: 0 });

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const connect = () => {
      const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${scheme}//${location.host}${PANEL_CHANNEL_PATH}`);
      socket = ws;
      ws.onopen = () => {
        setFeed((prev) => ({ ...prev, live: true }));
      };
      ws.onmessage = (event: MessageEvent) => {
        const message = parsePanelMessage(event.data);
        if (message?.type === 'pcs') {
          setFeed({
            map: message.map,
            live: true,
            skewMs: Date.parse(message.map.at) - Date.now(),
          });
        }
      };
      ws.onclose = (event: CloseEvent) => {
        if (stopped) return;
        setFeed((prev) => ({ ...prev, live: false }));
        if (event.code === PANEL_UNAUTHORIZED_CLOSE) {
          expire();
          return;
        }
        retry = setTimeout(connect, RECONNECT_MS);
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [expire]);

  return feed;
}

/** La hora del nodo, refrescada cada segundo para contar el restante en vivo. */
export function useNodeNow(skewMs: number): Date {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return new Date(now + skewMs);
}
