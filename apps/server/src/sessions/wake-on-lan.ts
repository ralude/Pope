import { createSocket } from 'node:dgram';

import { Inject, Injectable } from '@nestjs/common';
import { pcMacAddressSchema } from '@pope/shared';

import { APP_CONFIG, type AppConfig } from '../config.js';

/** Copias del paquete y pausa entre ellas: un UDP suelto puede perderse (D8 de la guía). */
export const WAKE_PACKET_COPIES = 3;
export const WAKE_PACKET_GAP_MS = 100;

/**
 * Paquete mágico (REQ-003-22): 6 bytes 0xFF y la MAC repetida 16 veces, 102 bytes en total.
 * Exige la MAC canónica `AA:BB:CC:DD:EE:FF`.
 */
export function magicPacket(mac: string): Buffer {
  const valid = pcMacAddressSchema.parse(mac);
  const bytes = Buffer.from(valid.replaceAll(':', ''), 'hex');
  return Buffer.concat([Buffer.alloc(6, 0xff), ...Array.from({ length: 16 }, () => bytes)]);
}

/** Envía el paquete mágico por UDP. En los tests se sustituye por `RecordingWakeSender`. */
@Injectable()
export class WakeOnLanSender {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** Envía las copias con difusión y cierra el socket. Lanza si falla algún envío. */
  async send(mac: string): Promise<void> {
    const packet = magicPacket(mac);
    const { address, port } = this.config.wakeOnLan;
    const socket = createSocket('udp4');
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('error', reject);
        socket.bind(0, resolve);
      });
      socket.setBroadcast(true);
      for (let copy = 0; copy < WAKE_PACKET_COPIES; copy++) {
        if (copy > 0) await new Promise((resolve) => setTimeout(resolve, WAKE_PACKET_GAP_MS));
        await new Promise<void>((resolve, reject) => {
          socket.send(packet, port, address, (error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      }
    } finally {
      socket.close();
    }
  }
}
