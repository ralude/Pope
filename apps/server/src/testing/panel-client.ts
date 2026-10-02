// Panel de prueba conectado al canal en vivo del nodo (T38a), para los tests e2e.
import { type PanelMessage, panelMessageSchema, type PcMap } from '@pope/shared';
import { WebSocket } from 'ws';

/** Panel conectado al canal en vivo: guarda los mensajes y el cierre. */
export class PanelClient {
  private readonly inbox: PanelMessage[] = [];
  private waiting: ((message: PanelMessage) => void) | null = null;
  readonly closed: Promise<number>;

  constructor(private readonly ws: WebSocket) {
    ws.on('message', (data: Buffer) => {
      const message = panelMessageSchema.parse(JSON.parse(data.toString('utf8')));
      if (this.waiting) {
        this.waiting(message);
        this.waiting = null;
      } else {
        this.inbox.push(message);
      }
    });
    this.closed = new Promise((resolve) => {
      ws.on('close', (code: number) => {
        resolve(code);
      });
    });
  }

  static connect(url: string, cookie?: string): PanelClient {
    return new PanelClient(new WebSocket(url, { headers: cookie ? { cookie } : {} }));
  }

  next(): Promise<PanelMessage> {
    const queued = this.inbox.shift();
    if (queued) {
      return Promise.resolve(queued);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting = null;
        reject(new Error('El panel no recibió nada en 5 s'));
      }, 5000);
      this.waiting = (message) => {
        clearTimeout(timer);
        resolve(message);
      };
    });
  }

  /** El siguiente mapa, saltando los demás mensajes. */
  async nextMap(): Promise<PcMap> {
    for (;;) {
      const message = await this.next();
      if (message.type === 'pcs') return message.map;
    }
  }

  /** El siguiente número de interrumpidas pendientes, saltando los mapas. */
  async nextPending(): Promise<number> {
    for (;;) {
      const message = await this.next();
      if (message.type === 'interrupted') return message.pending;
    }
  }

  close(): void {
    this.ws.close();
  }
}
