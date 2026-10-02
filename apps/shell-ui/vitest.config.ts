import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Solo se prueba la lógica del Shell (canal con el nodo, login); las pantallas se
    // verifican a mano contra el servidor local (tasks.md, fase 9).
    include: ['src/**/*.test.ts'],
  },
});
