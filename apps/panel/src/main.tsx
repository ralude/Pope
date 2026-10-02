// Fuente del diseño, incluida en el panel porque el local trabaja sin internet. Solo el
// alfabeto latino (tildes y eñe incluidas) y los pesos que se usan.
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import './theme.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Falta el elemento #root en index.html');
}
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
