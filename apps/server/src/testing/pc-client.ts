import type { AddressInfo } from 'node:net';

import { type NodeToPcMessage, nodeToPcMessageSchema, PROTOCOL_VERSION } from '@pope/shared';
import { WebSocket } from 'ws';

import { PC_CHANNEL_PATH } from '../sessions/pc-gateway.js';
import type { TestApp } from './app.js';

/** Pone a escuchar la app de test en un puerto libre y devuelve la URL del canal de PCs. */
export async function listenForPcs(testApp: TestApp): Promise<string> {
  await testApp.app.listen(0, '127.0.0.1');
  const { port } = testApp.app.getHttpServer().address() as AddressInfo;
  return `ws://127.0.0.1:${String(port)}${PC_CHANNEL_PATH}`;
}

/**
 * PC simulada para los tests: habla el protocolo por WebSocket real y guarda en cola los
 * mensajes que recibe, validados con los esquemas de `shared`.
 */
export class PcTestClient {
  private readonly inbox: NodeToPcMessage[] = [];
  private waiting: ((message: NodeToPcMessage) => void) | null = null;
  readonly closed: Promise<{ code: number; reason: string }>;

  private constructor(private readonly ws: WebSocket) {
    ws.on('message', (data: Buffer) => {
      const message = nodeToPcMessageSchema.parse(JSON.parse(data.toString('utf8')));
      if (this.waiting) {
        this.waiting(message);
        this.waiting = null;
      } else {
        this.inbox.push(message);
      }
    });
    this.closed = new Promise((resolve) => {
      ws.on('close', (code, reason) => {
        resolve({ code, reason: reason.toString('utf8') });
      });
    });
  }

  static async connect(url: string): Promise<PcTestClient> {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => {
        resolve();
      });
      ws.once('error', reject);
    });
    return new PcTestClient(ws);
  }

  /** Conecta y se identifica como la PC `pcId`; devuelve el primer `state`. */
  static async hello(
    url: string,
    pcId: string,
    sessionId: string | null = null,
  ): Promise<{ pc: PcTestClient; state: NodeToPcMessage }> {
    const pc = await PcTestClient.connect(url);
    pc.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, pcId, sessionId });
    return { pc, state: await pc.next() };
  }

  send(message: object | string): void {
    this.ws.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  /** Siguiente mensaje recibido; falla si no llega en 2 s. */
  next(): Promise<NodeToPcMessage> {
    const queued = this.inbox.shift();
    if (queued) {
      return Promise.resolve(queued);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting = null;
        reject(new Error('La PC no recibió ningún mensaje en 2 s'));
      }, 2000);
      this.waiting = (message) => {
        clearTimeout(timer);
        resolve(message);
      };
    });
  }

  /** Envía un mensaje y devuelve la respuesta. */
  async request(message: object): Promise<NodeToPcMessage> {
    this.send(message);
    return this.next();
  }

  close(): void {
    this.ws.close();
  }
}
