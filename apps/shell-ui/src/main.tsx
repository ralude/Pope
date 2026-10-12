// Fuente del diseño, incluida en el Shell porque el local trabaja sin internet. Solo el
// alfabeto latino (tildes y eñe incluidas) y los pesos que se usan.
import '@fontsource/nunito/latin-300.css';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import './theme.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import type { PcChannel } from './channel/channel.js';
import { WebViewChannel } from './channel/webview.js';

let channel: PcChannel;
let pcName = 'PC';
if (import.meta.env.DEV) {
  const { createDevChannel } = await import('./channel/dev-entry.js');
  ({ channel, pcName } = await createDevChannel());
} else {
  channel = new WebViewChannel(window.chrome?.webview);
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Falta el elemento #root en index.html');
}
createRoot(root).render(
  <StrictMode>
    <App channel={channel} pcName={pcName} />
  </StrictMode>,
);
