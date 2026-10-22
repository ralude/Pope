import type { AddressInfo } from 'node:net';

import {
  type NativeNodeToPcMessage as NodeToPcMessage,
  nativeNodeToPcMessageSchema,
  NATIVE_PC_PROTOCOL_VERSION,
  newId,
} from '@pope/shared';
import { WebSocket } from 'ws';

import { PC_CHANNEL_PATH } from '../sessions/pc-gateway.js';
import type { TestApp } from './app.js';
import { testPcCredentials } from './pc-credentials.js';

const credentialsByUrl = new Map<string, Map<string, string>>();

/** Pone a escuchar la app de test en un puerto libre y devuelve la URL del canal de PCs. */
export async function listenForPcs(testApp: TestApp): Promise<string> {
  await testApp.app.listen(0, '127.0.0.1');
  const { port } = testApp.app.getHttpServer().address() as AddressInfo;
  const url = `ws://127.0.0.1:${String(port)}${PC_CHANNEL_PATH}`;
  credentialsByUrl.set(url, await testPcCredentials(testApp));
  const close = testApp.close.bind(testApp);
  testApp.close = async () => {
    credentialsByUrl.delete(url);
    await close();
  };
  return url;
}

/**
 * PC simulada para los tests: habla el protocolo por WebSocket real y guarda en cola los
 * mensajes que recibe, validados con los esquemas de `shared`.
 */
export class PcTestClient {
  private readonly inbox: NodeToPcMessage[] = [];
  private waiting: ((message: NodeToPcMessage) => void) | null = null;
  readonly closed: Promise<{ code: number; reason: string }>;
  /**
   * Último `controlState` recibido. Como el agente, lo guarda aparte en lugar de ponerlo en
   * la cola: así los tests de sesión siguen leyendo sus `state` con `next()` (T28).
   */
  control: Extract<NodeToPcMessage, { type: 'controlState' }> | null = null;
  /** Cuántos `controlState` ha recibido, para comprobar que el nodo no los repite. */
  controls = 0;
  /** Órdenes recibidas, en orden; también aparte, como las consume el agente en C#. */
  readonly commands: Extract<NodeToPcMessage, { type: 'command' }>['command'][] = [];
  /** `maintenanceState` recibidos, en orden; aparte, como los consume el agente (T35). */
  readonly maintenance: Extract<NodeToPcMessage, { type: 'maintenanceState' }>[] = [];
  /**
   * Como el agente tras limpiar los procesos del cliente (T29): responde enseguida que el
   * bloqueo se aplicó, para que la PC vuelva a admitir clientes. Los tests del bloqueo lo
   * desactivan para responder ellos.
   */
  autoLock = true;

  private applyLock(commandId: string): void {
    const occurredAt = new Date().toISOString();
    for (const result of [
      { status: 'accepted', kind: 'lock' },
      { status: 'applied', effect: { kind: 'lock' } },
    ]) {
      this.send({ type: 'commandAck', commandId, occurredAt, result });
    }
  }

  private constructor(private readonly ws: WebSocket) {
    ws.on('message', (data: Buffer) => {
      const message = nativeNodeToPcMessageSchema.parse(JSON.parse(data.toString('utf8')));
      if (message.type === 'controlState') {
        this.control = message;
        this.controls++;
        return;
      }
      if (message.type === 'maintenanceState') {
        this.maintenance.push(message);
        return;
      }
      if (message.type === 'command') {
        this.commands.push(message.command);
        if (this.autoLock && message.command.action.kind === 'lock')
          this.applyLock(message.command.id);
        return;
      }
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

  static async connect(url: string, pcId?: string): Promise<PcTestClient> {
    const credentials = credentialsByUrl.get(url);
    const credential = pcId ? credentials?.get(pcId) : credentials?.values().next().value;
    const ws = new WebSocket(url, {
      headers: credential ? { authorization: `Bearer ${credential}` } : {},
    });
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
    localRemainingSeconds?: number,
  ): Promise<{ pc: PcTestClient; state: NodeToPcMessage }> {
    const pc = await PcTestClient.connect(url, pcId);
    pc.send({
      type: 'hello',
      protocolVersion: NATIVE_PC_PROTOCOL_VERSION,
      pcId,
      sessionId,
      recoveryState: 'known',
      pendingMaintenanceExitId: null,
      controlContext: sessionId
        ? { kind: 'session', revision: newId(), sessionId }
        : { kind: 'free', revision: newId() },
      ...(localRemainingSeconds !== undefined && { localRemainingSeconds }),
    });
    return { pc, state: await pc.next() };
  }

  send(message: object | string): void {
    // Conserva los helpers de regresión: el latido v2 añade el contexto desconocido.
    const frame =
      typeof message === 'object' &&
      'type' in message &&
      message.type === 'heartbeat' &&
      !('controlContext' in message)
        ? { ...message, controlContext: null }
        : message;
    this.ws.send(typeof frame === 'string' ? frame : JSON.stringify(frame));
  }

  /** Siguiente mensaje recibido; falla si no llega en 5 s (margen para equipos lentos). */
  next(): Promise<NodeToPcMessage> {
    const queued = this.inbox.shift();
    if (queued) {
      return Promise.resolve(queued);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting = null;
        reject(new Error('La PC no recibió ningún mensaje en 5 s'));
      }, 5000);
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
