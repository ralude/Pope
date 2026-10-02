// Fuente del diseño, incluida en el Shell porque el local trabaja sin internet. Solo el
// alfabeto latino (tildes y eñe incluidas) y los pesos que se usan.
import '@fontsource/nunito/latin-300.css';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import './theme.css';

import { devPcId, devPcName, MAX_DEV_PCS } from '@pope/shared';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import { DevSocketChannel, PC_CHANNEL_PATH } from './channel/dev-socket.js';

/**
 * PC de ejemplo que hace de esta en desarrollo: `?pc=5` es "PC 05" (por defecto, la 1). Con la
 * spec 003 la identidad la tendrá el agente, no el Shell.
 */
function devPcNumber(search: string): number {
  const n = Number(new URLSearchParams(search).get('pc') ?? '1');
  return Number.isInteger(n) && n >= 1 && n <= MAX_DEV_PCS ? n : 1;
}

const pcNumber = devPcNumber(location.search);
const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
const channel = new DevSocketChannel({
  url: `${scheme}//${location.host}${PC_CHANNEL_PATH}`,
  pcId: devPcId(pcNumber),
});

const root = document.getElementById('root');
if (!root) {
  throw new Error('Falta el elemento #root en index.html');
}
createRoot(root).render(
  <StrictMode>
    <App channel={channel} pcName={devPcName(pcNumber)} />
  </StrictMode>,
);
