// Este módulo solo se importa en modo DEV; no forma parte del paquete de Windows.
import { registeredPcSchema } from '@pope/shared';

import { DevSocketChannel, PC_CHANNEL_PATH } from './dev-socket.js';
import type { PcChannel } from './channel.js';
import { WebViewChannel } from './webview.js';

export async function createDevChannel(): Promise<{ channel: PcChannel; pcName: string }> {
  try {
    const response = await fetch('/__pope-dev-identity', { cache: 'no-store' });
    if (!response.ok) throw new Error('Perfil de simulación no configurado.');
    const text = await response.text();
    if (new TextEncoder().encode(text).length > 16_384) throw new Error('Identidad no válida.');
    const pc = registeredPcSchema.parse(JSON.parse(text));
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return {
      channel: new DevSocketChannel({
        url: `${scheme}//${location.host}${PC_CHANNEL_PATH}`,
        pcId: pc.id,
      }),
      pcName: pc.name,
    };
  } catch {
    return { channel: new WebViewChannel(undefined), pcName: 'PC' };
  }
}
