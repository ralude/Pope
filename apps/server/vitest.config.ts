import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // esbuild (el compilador por defecto de Vitest) no emite los metadatos de decoradores que
  // necesita la inyección de dependencias de NestJS; SWC sí.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
