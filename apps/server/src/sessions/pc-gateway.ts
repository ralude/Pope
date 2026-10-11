import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';

import {
  type BeforeApplicationShutdown,
  Injectable,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import {
  type NativeNodeToPcMessage,
  type PcAuthenticationError,
  PANEL_CHANNEL_PATH,
} from '@pope/shared';
import { type WebSocket, WebSocketServer } from 'ws';

import { PanelHub } from './panel-hub.js';
import type { PcConnection, PcIdentity } from './pc-connections.js';
import { PcProtocolService } from './pc-protocol.service.js';
import { PcAuthenticationService, type AuthenticatedPc } from '../pcs/pc-authentication.service.js';
import { EventsService } from '../events/events.service.js';

/** Ruta del canal de las PCs: `wss://nodo:3000/pc` (loopback HTTP solo en desarrollo). */
export const PC_CHANNEL_PATH = '/pc';

/** Tiempo que tiene una PC para enviar `hello` tras conectar. */
const HELLO_TIMEOUT_MS = 10_000;

/** Tamaño máximo de un mensaje de la PC: los del protocolo ocupan unos cientos de bytes. */
const MAX_MESSAGE_BYTES = 16 * 1024;

/** Conexión de `ws` adaptada a `PcConnection`. Procesa sus mensajes de uno en uno. */
class WsPcConnection implements PcConnection {
  pc: PcIdentity | null = null;
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  private closing = false;

  constructor(
    private readonly ws: WebSocket,
    readonly authentication: AuthenticatedPc,
  ) {}

  send(message: NativeNodeToPcMessage): void {
    if (this.ws.readyState === this.ws.OPEN) {
      if (this.ws.bufferedAmount > 256 * 1024) {
        this.close(1008, 'Cola de salida excedida');
        return;
      }
      this.ws.send(JSON.stringify(message));
    }
  }

  close(code: number, reason: string): void {
    this.closing = true;
    this.ws.close(code, reason);
  }

  /**
   * Encadena el trabajo de cada mensaje: así un latido nunca se cruza con un login de la
   * misma PC que aún no ha terminado.
   */
  enqueue(work: () => Promise<void>): void {
    if (this.closing) return;
    if (++this.pending > 32) {
      this.close(1008, 'Cola de mensajes excedida');
      return;
    }
    this.queue = this.queue.then(async () => {
      try {
        if (!this.closing) await work();
      } catch {
        this.closing = true;
        this.ws.terminate();
      } finally {
        this.pending--;
      }
    });
  }

  finish(cleanup: () => void): void {
    this.closing = true;
    void this.queue.then(cleanup);
  }
}

/**
 * Canal WebSocket de las PCs (ADR-0003): librería `ws`, sin Socket.IO, montada sobre el
 * mismo servidor HTTP de Fastify en la ruta `/pc`. Cada mensaje se enruta por su `type`
 * en `PcProtocolService`.
 */
@Injectable()
export class PcGateway implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  private readonly live = new Map<WebSocket, WsPcConnection>();
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly protocol: PcProtocolService,
    private readonly panel: PanelHub,
    private readonly authentication: PcAuthenticationService,
    private readonly events: EventsService,
  ) {}

  onApplicationBootstrap(): void {
    this.unsubscribe = this.events.subscribe((committed) => {
      for (const event of committed) {
        if (event.type !== 'pc.registered' || !event.payload.recovery) continue;
        for (const connection of this.live.values()) {
          if (
            connection.authentication.pc.id === event.payload.pc.id &&
            connection.authentication.credentialId !== event.payload.credentialId
          ) {
            connection.send({
              type: 'pcAuthenticationError',
              code: 'pc_credential_revoked',
              message: 'Credencial de PC sustituida',
            });
            connection.close(1008, 'Credencial de PC sustituida');
          }
        }
      }
    });
    const server = this.adapterHost.httpAdapter.getHttpServer() as Server;
    server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      // Un solo punto de entrada para los WebSocket del nodo: las PCs y el panel.
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (path === PANEL_CHANNEL_PATH) {
        this.panel.handleUpgrade(request, socket, head);
        return;
      }
      if (path !== PC_CHANNEL_PATH) {
        socket.destroy();
        return;
      }
      void this.upgrade(request, socket, head);
    });
  }

  /** Cierra las conexiones abiertas para que el servidor HTTP pueda terminar. */
  beforeApplicationShutdown(): void {
    this.unsubscribe?.();
    for (const client of this.wss.clients) {
      client.terminate();
    }
    this.wss.close();
  }

  private async upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    // Capturar errores del socket mientras se consulta PostgreSQL, antes de que ws lo tome.
    const onError = () => socket.destroy();
    socket.on('error', onError);
    try {
      const result = await this.authentication.authenticate(request.headers.authorization);
      if (socket.destroyed) return;
      if (!result.ok) {
        this.reject(socket, result.error);
        return;
      }
      // Los secretos solo se admiten en la cabecera; no aceptar query ni userinfo.
      if (new URL(request.url ?? '/', 'http://localhost').search) {
        this.reject(socket, {
          code: 'invalid_pc_credential',
          message: 'La URL del canal no admite parámetros',
        });
        return;
      }
      socket.off('error', onError);
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.accept(ws, result.identity);
      });
    } catch {
      socket.destroy();
    }
  }

  private reject(socket: Duplex, error: PcAuthenticationError): void {
    const body = JSON.stringify(error);
    socket.end(
      `HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: ${String(Buffer.byteLength(body))}\r\n\r\n${body}`,
    );
  }

  private accept(ws: WebSocket, authentication: AuthenticatedPc): void {
    const connection = new WsPcConnection(ws, authentication);
    this.live.set(ws, connection);
    const helloTimer = setTimeout(() => {
      if (!connection.pc) {
        connection.close(1008, 'La PC no envió hello');
      }
    }, HELLO_TIMEOUT_MS);
    ws.on('message', (data: Buffer, binary: boolean) => {
      if (binary) {
        connection.close(1003, 'Solo mensajes de texto');
        return;
      }
      const raw = data.toString('utf8');
      connection.enqueue(() => this.protocol.receive(connection, raw));
    });
    ws.on('close', () => {
      clearTimeout(helloTimer);
      this.live.delete(ws);
      connection.finish(() => {
        this.protocol.disconnected(connection);
      });
    });
    ws.on('error', () => {
      ws.terminate();
    });
  }
}
