// REQ-003-03/04/63: React solo envía peticiones UI; el agente conserva conexión y latidos.
import {
  nativeBridgeEventSchema,
  nativeBridgeRequestSchema,
  nodeToPcMessageSchema,
} from '@pope/shared';

import type { ChannelEvent, PcChannel, ShellRequest } from './channel.js';

export interface WebViewBridge {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

declare global {
  interface Window {
    chrome?: { webview?: WebViewBridge };
  }
}

export class WebViewChannel implements PcChannel {
  private listener: ((event: ChannelEvent) => void) | null = null;
  private online = false;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly bridge: WebViewBridge | undefined) {}

  start(listener: (event: ChannelEvent) => void): void {
    this.stop();
    this.listener = listener;
    this.emit({ kind: 'status', status: 'connecting' });
    if (!this.bridge) {
      this.emit({ kind: 'status', status: 'offline' });
      return;
    }
    this.bridge.addEventListener('message', this.receive);
    this.ready();
  }

  stop(): void {
    this.clearTimer();
    this.bridge?.removeEventListener('message', this.receive);
    this.listener = null;
    this.online = false;
    this.attempt = 0;
  }

  send(request: ShellRequest): boolean {
    if (!this.online || !this.bridge || !this.listener) return false;
    const parsed = nativeBridgeRequestSchema.safeParse({ version: 1, kind: 'request', request });
    if (!parsed.success || !withinLimit(parsed.data)) return false;
    try {
      this.bridge.postMessage(parsed.data);
      return true;
    } catch {
      this.online = false;
      this.emit({ kind: 'status', status: 'offline' });
      this.ready();
      return false;
    }
  }

  private readonly receive = (event: { data: unknown }): void => {
    if (!this.listener || !withinLimit(event.data)) return;
    const parsed = nativeBridgeEventSchema.safeParse(event.data);
    if (!parsed.success) return;
    const envelope = parsed.data;
    if (envelope.kind === 'status') {
      this.clearTimer();
      this.attempt = 0;
      this.online = envelope.status === 'online';
      this.emit({ kind: 'status', status: envelope.status, pcName: envelope.pcName });
      return;
    }
    // Las pantallas existentes consumen este subconjunto. Órdenes/ACK no son notificaciones UI.
    const message = nodeToPcMessageSchema.safeParse(envelope.message);
    if (message.success)
      this.emit({
        kind: 'message',
        message: message.data,
        elapsedSeconds: envelope.elapsedSeconds,
      });
  };

  private ready(): void {
    if (!this.listener || !this.bridge || this.timer) return;
    // Se programa antes de enviar: una respuesta síncrona también cancela el reintento.
    this.timer = setTimeout(
      () => {
        this.timer = null;
        this.ready();
      },
      Math.min(30_000, 1000 * 2 ** this.attempt),
    );
    this.attempt = Math.min(5, this.attempt + 1);
    try {
      this.bridge.postMessage({ version: 1, kind: 'ready' });
    } catch {
      this.online = false;
      this.emit({ kind: 'status', status: 'offline' });
    }
  }
  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  private emit(event: ChannelEvent): void {
    this.listener?.(event);
  }
}

function withinLimit(value: unknown): boolean {
  try {
    const json = JSON.stringify(value);
    return typeof json === 'string' && new TextEncoder().encode(json).length <= 16_384;
  } catch {
    return false;
  }
}
