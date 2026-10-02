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
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service.js';
import { PcConnections } from './pc-connections.js';
import { PcMapService } from './pc-map.service.js';
import { TemporarySessionsService } from './temporary-sessions.service.js';

/** Como mucho, un envío del mapa por segundo: el panel corre en la gráfica integrada. */
export const PANEL_THROTTLE_MS = 1000;

/**
 * Cada cuánto se revisan las interrumpidas pendientes aunque no haya eventos: una caduca a
 * las 48 h del corte sin que pase nada más (REQ-001-71).
 */
export const PANEL_INTERRUPTED_CHECK_MS = 60_000;

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
 * confirmado, una PC que se conecta o desconecta), con un envío por segundo como mucho, y el
 * número de interrumpidas pendientes al conectar y cuando cambia (T45). El panel no envía
 * nada por aquí: sus acciones van por la API HTTP.
 */
@Injectable()
export class PanelHub implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger('PanelHub');
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  private readonly clients = new Set<WebSocket>();
  private lastSentAt = Number.NEGATIVE_INFINITY;
  private cancelPending: (() => void) | null = null;
  private cancelCheck: (() => void) | null = null;
  /** Último número de interrumpidas pendientes enviado; `null` si aún no se sabe. */
  private lastPending: number | null = null;
  /** Último estado de la tasa enviado (JSON), para enviarlo solo si cambia. */
  private lastRate: string | null = null;
  private unsubscribe: (() => void)[] = [];

  constructor(
    private readonly auth: AuthService,
    private readonly map: PcMapService,
    private readonly events: EventsService,
    private readonly connections: PcConnections,
    private readonly temporary: TemporarySessionsService,
    private readonly rates: ExchangeRatesService,
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
      this.rates.subscribe(() => {
        this.sendRateIfChanged();
        return Promise.resolve();
      }),
    ];
    this.scheduleCheck();
  }

  beforeApplicationShutdown(): void {
    for (const stop of this.unsubscribe) {
      stop();
    }
    this.cancelPending?.();
    this.cancelCheck?.();
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
      const pending = await this.temporary.pendingInterruptedCount();
      this.lastPending = pending;
      this.send(ws, { type: 'interrupted', pending });
      const rate = this.rates.status();
      this.lastRate = JSON.stringify(rate);
      this.send(ws, { type: 'exchangeRate', ...rate });
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
    await this.sendPendingIfChanged();
  }

  /**
   * Revisa cada minuto, haya o no eventos, las interrumpidas y la tasa: su antigüedad cambia
   * al cambiar de día aunque nadie la toque (REQ-005-35).
   */
  private scheduleCheck(): void {
    this.cancelCheck = this.clock.schedule(PANEL_INTERRUPTED_CHECK_MS, async () => {
      await this.sendPendingIfChanged();
      this.sendRateIfChanged();
      this.scheduleCheck();
    });
  }

  /** Envía el número de interrumpidas pendientes a todos si cambió desde el último envío. */
  private async sendPendingIfChanged(): Promise<void> {
    if (this.clients.size === 0) {
      return;
    }
    try {
      const pending = await this.temporary.pendingInterruptedCount();
      if (pending === this.lastPending) {
        return;
      }
      this.lastPending = pending;
      for (const client of this.clients) {
        this.send(client, { type: 'interrupted', pending });
      }
    } catch (error) {
      this.logger.error('No se pudieron contar las interrumpidas para el panel', error);
    }
  }

  /** Envía la tasa vigente a todos si cambió desde el último envío (REQ-005-36). */
  private sendRateIfChanged(): void {
    const status = this.rates.status();
    const json = JSON.stringify(status);
    if (this.clients.size === 0 || json === this.lastRate) {
      return;
    }
    this.lastRate = json;
    for (const client of this.clients) {
      this.send(client, { type: 'exchangeRate', ...status });
    }
  }

  private send(ws: WebSocket, message: PanelMessage): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(panelMessageSchema.parse(message)));
    }
  }
}
