// Este módulo solo se importa en modo DEV; no forma parte del paquete de Windows.
import { devPcId, devPcName, MAX_DEV_PCS } from '@pope/shared';

import { DevSocketChannel, PC_CHANNEL_PATH } from './dev-socket.js';

export function createDevChannel(): { channel: DevSocketChannel; pcName: string } {
  const selected = Number(new URLSearchParams(location.search).get('pc') ?? '1');
  const number =
    Number.isInteger(selected) && selected >= 1 && selected <= MAX_DEV_PCS ? selected : 1;
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return {
    channel: new DevSocketChannel({
      url: `${scheme}//${location.host}${PC_CHANNEL_PATH}`,
      pcId: devPcId(number),
    }),
    pcName: devPcName(number),
  };
}
