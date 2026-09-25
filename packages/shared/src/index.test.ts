import { describe, expect, it } from 'vitest';

import * as shared from './index.js';

// El punto de entrada reexporta cada módulo del paquete.
describe('@pope/shared', () => {
  it('exporta el dinero y el tiempo', () => {
    expect(shared.formatMoney).toBeTypeOf('function');
    expect(shared.formatDuration).toBeTypeOf('function');
  });
});
