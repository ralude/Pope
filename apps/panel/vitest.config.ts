import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Solo se prueba la lógica del panel (cliente de API, cálculos); las pantallas se
    // verifican a mano contra el servidor y el simulador (tasks.md, fase 8).
    include: ['src/**/*.test.ts'],
  },
});
