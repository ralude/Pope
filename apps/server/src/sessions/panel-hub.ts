import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

import {
  type BeforeApplicationShutdown,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { PANEL_UNAUTHORIZED_CLOSE, type PanelMessage, panelMessageSchema } from '@pope/shared';
import { type WebSocket, WebSocketServer } from 'ws';

import { AuthService } from '../auth/auth.service.js';
import { STAFF_COOKIE } from '../auth/staff-cookie.js';
import { Clock } from '../common/clock.js';
import { EventsService } from '../events/events.service.js';
import { PcConnections } from './pc-connections.js';
import { PcMapService } from './pc-map.service.js';

/** Como mucho, un envío del mapa por segundo: el panel corre en la gráfica integrada. */
export const PANEL_THROTTLE_MS = 1000;

/** Lee una cookie de la cabecera `Cookie` de la petición de conexión. */
export function cookieFrom(header: string | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Canal en vivo del panel (T38a): `ws://nodo:3000/panel`, autenticado con la cookie del
 * personal. Envía el mapa de PCs al conectar y cada vez que algo cambia (un evento
 * confirmado, una PC que se conecta o desconecta), con un envío por segundo como mucho. El
 * panel no envía nada por aquí: sus acciones van por la API HTTP.
 */
@Injectable()
export class PanelHub implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger('PanelHub');
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  private readonly clients = new Set<WebSocket>();
  private lastSentAt = Number.NEGATIVE_INFINITY;
  private cancelPending: (() => void) | null = null;
  private unsubscribe: (() => void)[] = [];

  constructor(
    private readonly auth: AuthService,
    private readonly map: PcMapService,
    private readonly events: EventsService,
    private readonly connections: PcConnections,
    private readonly clock: Clock,
  ) {}

  onApplicationBootstrap(): void {
    this.unsubscribe = [
      this.events.subscribe(() => {
        this.changed();
      }),
      this.connections.subscribe(() => {
        this.changed();
      }),
    ];
  }

  beforeApplicationShutdown(): void {
    for (const stop of this.unsubscribe) {
      stop();
    }
    this.cancelPending?.();
    for (const client of this.wss.clients) {
      client.terminate();
    }
    this.wss.close();
  }

  /** Acepta la conexión y la cierra si no trae una sesión del personal válida. */
  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      void this.accept(ws, cookieFrom(request.headers.cookie, STAFF_COOKIE));
    });
  }

  private async accept(ws: WebSocket, token: string | null): Promise<void> {
    ws.on('error', () => {
      ws.terminate();
    });
    const session = token ? await this.auth.authenticate(token) : null;
    if (!session) {
      ws.close(PANEL_UNAUTHORIZED_CLOSE, 'Inicia sesión para continuar');
      return;
    }
    this.clients.add(ws);
    ws.on('close', () => {
      this.clients.delete(ws);
    });
    try {
      this.send(ws, { type: 'pcs', map: await this.map.snapshot() });
    } catch (error) {
      this.logger.error('No se pudo enviar el mapa al panel', error);
    }
  }

  /** Algo cambió: envía ya si hace más de un segundo del último envío, si no, al cumplirse. */
  private changed(): void {
    if (this.clients.size === 0 || this.cancelPending) {
      return;
    }
    const wait = Math.max(0, this.lastSentAt + PANEL_THROTTLE_MS - this.clock.now().getTime());
    this.cancelPending = this.clock.schedule(wait, async () => {
      this.cancelPending = null;
      this.lastSentAt = this.clock.now().getTime();
      await this.broadcast();
    });
  }

  private async broadcast(): Promise<void> {
    if (this.clients.size === 0) {
      return;
    }
    try {
      const message: PanelMessage = { type: 'pcs', map: await this.map.snapshot() };
      for (const client of this.clients) {
        this.send(client, message);
      }
    } catch (error) {
      this.logger.error('No se pudo enviar el mapa al panel', error);
    }
  }

  private send(ws: WebSocket, message: PanelMessage): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(panelMessageSchema.parse(message)));
    }
  }
}
