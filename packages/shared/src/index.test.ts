import { describe, expect, it } from 'vitest';

import { SHARED_PACKAGE } from './index.js';

// Test de humo (spec 001 · T03): comprueba que Vitest ejecuta TypeScript estricto con
// módulos ESM y que el punto de entrada del paquete se puede importar.
describe('@pope/shared', () => {
  it('se puede importar', () => {
    expect(SHARED_PACKAGE).toBe('@pope/shared');
  });
});
