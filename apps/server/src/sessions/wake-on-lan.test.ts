import { createSocket } from 'node:dgram';

import { describe, expect, it } from 'vitest';

import type { AppConfig } from '../config.js';
import { magicPacket, WAKE_PACKET_COPIES, WakeOnLanSender } from './wake-on-lan.js';

const MAC = 'AA:BB:CC:DD:EE:FF';

describe('paquete mágico de Wake-on-LAN (spec 003, T33b)', () => {
  it('REQ-003-22: son 6 bytes 0xFF y la MAC 16 veces (102 bytes)', () => {
    const packet = magicPacket(MAC);
    expect(packet).toHaveLength(102);
    expect([...packet.subarray(0, 6)]).toEqual([255, 255, 255, 255, 255, 255]);
    for (let copy = 0; copy < 16; copy++) {
      expect(packet.subarray(6 + copy * 6, 12 + copy * 6).toString('hex')).toBe('aabbccddeeff');
    }
  });

  it('REQ-003-22: una MAC que no es canónica lanza', () => {
    expect(() => magicPacket('aa:bb:cc:dd:ee:ff')).toThrow();
    expect(() => magicPacket('AA-BB-CC-DD-EE-FF')).toThrow();
    expect(() => magicPacket('01:00:5E:00:00:01')).toThrow();
  });

  it('REQ-003-22: captura local, llegan 3 paquetes idénticos al esperado', async () => {
    const receiver = createSocket('udp4');
    const received: Buffer[] = [];
    receiver.on('message', (message) => received.push(message));
    await new Promise<void>((resolve) => receiver.bind(0, '127.0.0.1', resolve));
    try {
      const config = {
        wakeOnLan: { address: '127.0.0.1', port: receiver.address().port },
      } as AppConfig;
      await new WakeOnLanSender(config).send(MAC);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(received).toHaveLength(WAKE_PACKET_COPIES);
      for (const packet of received) expect(packet.equals(magicPacket(MAC))).toBe(true);
    } finally {
      receiver.close();
    }
  });
});
