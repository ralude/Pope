import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Nodo local contra el que se desarrolla. El panel y la API comparten origen a través de
// este proxy, así la cookie de la sesión del personal (httpOnly, sameSite estricta) funciona
// igual que cuando el nodo sirve el panel compilado (T45a).
const NODE = 'http://127.0.0.1:3000';

// Rutas de la API del nodo. Las del panel van en español (`/clientes`), así no chocan.
const API = [
  '/auth',
  '/customers',
  '/combos',
  '/tariffs',
  '/shifts',
  '/sessions',
  '/settings',
  '/staff',
  '/pcs',
  '/health',
  // Spec 005.
  '/exchange-rate',
  '/products',
  '/sales',
];

export default defineConfig({
  plugins: [react()],
  server: {
    // Siempre en IPv4: en Windows, `localhost` puede quedarse solo en IPv6 (::1) y entonces
    // http://127.0.0.1:5173 (la dirección de AGENTS.md) no responde.
    host: '127.0.0.1',
    proxy: {
      ...Object.fromEntries(API.map((path) => [path, { target: NODE }])),
      // Canal en vivo del panel (T38a).
      '/panel': { target: NODE, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    // El navegador del local es moderno (Windows 10/11); no hace falta transpilar de más.
    target: 'es2022',
  },
});
