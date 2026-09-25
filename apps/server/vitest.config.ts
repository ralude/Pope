import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // esbuild (el compilador por defecto de Vitest) no emite los metadatos de decoradores que
  // necesita la inyección de dependencias de NestJS; SWC sí.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts'],
    // Cada test crea su base de datos con PGlite (WASM) y aplica las migraciones; con varios
    // archivos en paralelo puede pasar de los 5 s por defecto sin que nada vaya mal.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
