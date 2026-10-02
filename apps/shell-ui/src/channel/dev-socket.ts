// Canal de desarrollo (T46): el Shell habla directamente con el nodo por WebSocket y hace
// también de agente: se identifica con `hello`, late cada 10 s y reconecta si se corta (plan
// 001, "Comportamiento del agente en el canal"). En la PC real esto lo hará el agente en C#
// (spec 003) y el Shell usará el puente de WebView2.
import { nodeToPcMessageSchema, PROTOCOL_VERSION, type NodeToPcMessage } from '@pope/shared';

import type { ChannelEvent, PcChannel, ShellRequest } from './channel.js';

/** Ruta del canal de las PCs en el nodo (`PC_CHANNEL_PATH` del servidor). */
export const PC_CHANNEL_PATH = '/pc';

/** Espera entre reintentos de conexión: 1, 2, 4, 8, 16 y, como tope, 30 s (como el simulador). */
export const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 16_000, 30_000] as const;

/** Lo mínimo que se usa de un WebSocket; los tests pasan uno falso. */
export interface DevSocket {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
}

export interface DevSocketChannelOptions {
  /** URL del canal, p. ej. `ws://127.0.0.1:5174/pc`. */
  url: string;
  /** Id de la PC de ejemplo con la que se identifica (`devPcId`). */
  pcId: string;
  connect?: (url: string) => DevSocket;
  heartbeatMs?: number;
}

/** Lee un mensaje del nodo; `null` si no es JSON o no cumple el protocolo. */
export function parseNodeMessage(data: unknown): NodeToPcMessage | null {
  if (typeof data !== 'string') return null;
  try {
    const parsed = nodeToPcMessageSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export class DevSocketChannel implements PcChannel {
  private readonly connectFn: (url: string) => DevSocket;
  private readonly heartbeatMs: number;

  private listener: ((event: ChannelEvent) => void) | null = null;
  private socket: DevSocket | null = null;
  private open = false;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /** Sesión que cree tener la PC y su restante según el último `state` del nodo. */
  private sessionId: string | null = null;
  private remainingBase = 0;
  private remainingSyncedAt = 0;

  constructor(private readonly options: DevSocketChannelOptions) {
    this.connectFn = options.connect ?? ((url) => new WebSocket(url) as unknown as DevSocket);
    this.heartbeatMs = options.heartbeatMs ?? 10_000;
  }

  start(listener: (event: ChannelEvent) => void): void {
    this.listener = listener;
    this.emit({ kind: 'status', status: 'connecting' });
    this.connect();
  }

  stop(): void {
    this.listener = null;
    this.stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    this.open = false;
    socket?.close();
  }

  send(request: ShellRequest): boolean {
    return this.write(request);
  }

  private connect(): void {
    const socket = this.connectFn(this.options.url);
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.open = true;
      this.attempt = 0;
      const remaining = this.localRemaining();
      this.write({
        type: 'hello',
        protocolVersion: PROTOCOL_VERSION,
        pcId: this.options.pcId,
        sessionId: this.sessionId,
        ...(remaining !== null && { localRemainingSeconds: remaining }),
      });
      this.startHeartbeat();
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      const message = parseNodeMessage(event.data);
      if (message) this.receive(message);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.open = false;
      this.stopHeartbeat();
      this.emit({ kind: 'status', status: 'offline' });
      this.scheduleReconnect();
    };
  }

  private receive(message: NodeToPcMessage): void {
    if (message.type === 'state') {
      if (message.status === 'active') {
        this.sessionId = message.session.sessionId;
        this.remainingBase = message.session.remainingSeconds;
        this.remainingSyncedAt = Date.now();
      } else {
        this.sessionId = null;
      }
      // El primer `state` tras el `hello` confirma que el nodo reconoce a la PC.
      this.emit({ kind: 'status', status: 'online' });
    } else if (message.type === 'sessionEnded') {
      this.sessionId = null;
    }
    this.emit({ kind: 'message', message });
  }

  private scheduleReconnect(): void {
    if (!this.listener) return;
    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.attempt, RECONNECT_DELAYS_MS.length - 1)] ?? 30_000;
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.write({
        type: 'heartbeat',
        sessionId: this.sessionId,
        localRemainingSeconds: this.localRemaining(),
      });
    }, this.heartbeatMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  /** Restante según la PC: lo que dijo el nodo menos el tiempo pasado (REQ-001-63). */
  private localRemaining(): number | null {
    if (this.sessionId === null) return null;
    const elapsed = Math.floor((Date.now() - this.remainingSyncedAt) / 1000);
    return Math.max(0, this.remainingBase - elapsed);
  }

  private write(message: object): boolean {
    if (!this.open || !this.socket) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  private emit(event: ChannelEvent): void {
    this.listener?.(event);
  }
}
