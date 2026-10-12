import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Nodo local contra el que se desarrolla. En desarrollo el Shell hace también de agente y
// habla el canal de las PCs por este proxy (T46); con la spec 003 lo hará el agente en C#.
const NODE = 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'pope-shell-policy',
      apply: 'build',
      transformIndexHtml: {
        order: 'post',
        handler: () => [
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content:
                "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'",
            },
            injectTo: 'head-prepend',
          },
        ],
      },
    },
  ],
  // Rutas relativas: en la PC el host sirve el Shell desde una carpeta local (spec 003).
  base: './',
  server: {
    // El panel usa el 5173; así se pueden tener los dos abiertos.
    port: 5174,
    strictPort: true,
    proxy: {
      // Solo `/pc` exacto: `/pcs` es una ruta de la API del panel.
      '^/pc$': { target: NODE, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    // WebView2 es Chromium actual; no hace falta transpilar de más.
    target: 'es2022',
  },
});
