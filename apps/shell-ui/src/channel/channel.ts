// Canal del Shell con el nodo (T46). Las pantallas solo ven esta interfaz, que tendrá dos
// implementaciones: WebSocket directo al nodo en desarrollo (`dev-socket.ts`) y el puente de
// WebView2 con la spec 003, donde la conexión la mantiene el agente (REQ-003-63). Así el paso
// a la spec 003 no toca las pantallas.
import type { NodeToPcMessage, PcToNodeMessage } from '@pope/shared';

/** Peticiones que hace el Shell. `hello` y los latidos son cosa del agente. */
export type ShellRequest = Extract<
  PcToNodeMessage,
  { type: 'login' | 'logout' | 'buyCombo' | 'listCombos' }
>;

/**
 * `connecting`: aún no hay respuesta del nodo; `online`: el nodo ya contestó con el estado de
 * la PC; `offline`: se perdió la conexión y se está reintentando.
 */
export type ChannelStatus = 'connecting' | 'online' | 'offline';

export type ChannelEvent =
  { kind: 'status'; status: ChannelStatus } | { kind: 'message'; message: NodeToPcMessage };

export interface PcChannel {
  /** Empieza a conectar y avisa de cada cambio. Reintenta solo hasta `stop()`. */
  start(listener: (event: ChannelEvent) => void): void;
  stop(): void;
  /** Envía una petición al nodo. `false` si ahora mismo no hay conexión. */
  send(request: ShellRequest): boolean;
}
