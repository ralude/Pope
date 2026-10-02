import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';

import {
  type BeforeApplicationShutdown,
  Injectable,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { type NodeToPcMessage, PANEL_CHANNEL_PATH } from '@pope/shared';
import { type WebSocket, WebSocketServer } from 'ws';

import { PanelHub } from './panel-hub.js';
import type { PcConnection, PcIdentity } from './pc-connections.js';
import { PcProtocolService } from './pc-protocol.service.js';

/** Ruta del canal de las PCs: `ws://nodo:3000/pc`. */
export const PC_CHANNEL_PATH = '/pc';

/** Tiempo que tiene una PC para enviar `hello` tras conectar. */
const HELLO_TIMEOUT_MS = 10_000;

/** Tamaño máximo de un mensaje de la PC: los del protocolo ocupan unos cientos de bytes. */
const MAX_MESSAGE_BYTES = 16 * 1024;

/** Conexión de `ws` adaptada a `PcConnection`. Procesa sus mensajes de uno en uno. */
class WsPcConnection implements PcConnection {
  pc: PcIdentity | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly ws: WebSocket) {}

  send(message: NodeToPcMessage): void {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  close(code: number, reason: string): void {
    this.ws.close(code, reason);
  }

  /**
   * Encadena el trabajo de cada mensaje: así un latido nunca se cruza con un login de la
   * misma PC que aún no ha terminado.
   */
  enqueue(work: () => Promise<void>): void {
    this.queue = this.queue.then(work);
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

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly protocol: PcProtocolService,
    private readonly panel: PanelHub,
  ) {}

  onApplicationBootstrap(): void {
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
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.accept(ws);
      });
    });
  }

  /** Cierra las conexiones abiertas para que el servidor HTTP pueda terminar. */
  beforeApplicationShutdown(): void {
    for (const client of this.wss.clients) {
      client.terminate();
    }
    this.wss.close();
  }

  private accept(ws: WebSocket): void {
    const connection = new WsPcConnection(ws);
    const helloTimer = setTimeout(() => {
      if (!connection.pc) {
        connection.close(1008, 'La PC no envió hello');
      }
    }, HELLO_TIMEOUT_MS);
    ws.on('message', (data: Buffer) => {
      const raw = data.toString('utf8');
      connection.enqueue(() => this.protocol.receive(connection, raw));
    });
    ws.on('close', () => {
      clearTimeout(helloTimer);
      connection.enqueue(() => {
        this.protocol.disconnected(connection);
        return Promise.resolve();
      });
    });
    ws.on('error', () => {
      ws.terminate();
    });
  }
}
