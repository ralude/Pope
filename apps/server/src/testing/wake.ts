import { Injectable } from '@nestjs/common';

import { WakeOnLanSender } from '../sessions/wake-on-lan.js';

/** Sustituye al emisor real en los tests: ninguno envía broadcasts a la LAN. */
@Injectable()
export class RecordingWakeSender extends WakeOnLanSender {
  /** MACs a las que se «envió» el paquete. */
  readonly sent: string[] = [];
  /** Si es `true`, el siguiente envío falla. */
  fail = false;

  constructor() {
    super({ wakeOnLan: { address: '127.0.0.1', port: 9 } } as never);
  }

  override send(mac: string): Promise<void> {
    if (this.fail) return Promise.reject(new Error('Fallo simulado del envío'));
    this.sent.push(mac);
    return Promise.resolve();
  }
}
