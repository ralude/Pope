import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { devProxy } from './dev-proxy.js';

// Nodo local contra el que se desarrolla. En desarrollo el Shell hace también de agente y
// habla el canal de las PCs por este proxy (T46); con la spec 003 lo hará el agente en C#.
export default defineConfig(async ({ command, isPreview }) => {
  const development =
    command === 'serve' && !isPreview
      ? await devProxy(process.env.POPE_SIM_PROFILE, process.env.POPE_SIM_PC)
      : null;
  return {
    plugins: [
      react(),
      ...(development ? [development.plugin] : []),
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
                  // img-src admite además el host de fondos del host nativo (REQ-003-73): carpeta de solo
                  // lectura con imágenes que el agente verificó. Ningún otro origen puede cargar imágenes.
                  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https://background.pope.invalid; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'",
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
      host: '127.0.0.1',
      // El panel usa el 5173; así se pueden tener los dos abiertos.
      port: 5174,
      strictPort: true,
      proxy: development?.proxy ?? {},
    },
    build: {
      outDir: 'dist',
      // WebView2 es Chromium actual; no hace falta transpilar de más.
      target: 'es2022',
    },
  };
});
