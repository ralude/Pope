import { describe, expect, it } from 'vitest';

import { backgroundSize } from './size.js';

describe('tamaño reducido del fondo (REQ-003-76)', () => {
  it('reduce a 1920×1080 como mucho, conservando la proporción', () => {
    // Misma proporción 16:9: el factor es exacto.
    expect(backgroundSize(3840, 2160)).toEqual({ width: 1920, height: 1080 });
    expect(backgroundSize(7680, 4320)).toEqual({ width: 1920, height: 1080 });
    // Cuadrada: manda el alto.
    expect(backgroundSize(2000, 2000)).toEqual({ width: 1080, height: 1080 });
    // Vertical (9:16 de 1200×2160): también manda el alto, y el ancho baja con él.
    expect(backgroundSize(1200, 2160)).toEqual({ width: 600, height: 1080 });
    // Panorámica muy ancha: manda el ancho.
    expect(backgroundSize(5760, 1080)).toEqual({ width: 1920, height: 360 });
  });

  it('no amplía una imagen que ya cabe', () => {
    expect(backgroundSize(1920, 1080)).toEqual({ width: 1920, height: 1080 });
    expect(backgroundSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(backgroundSize(1080, 960)).toEqual({ width: 1080, height: 960 });
  });

  it('nunca deja un lado en 0 ni se pasa del máximo al redondear', () => {
    expect(backgroundSize(40_000, 10)).toEqual({ width: 1920, height: 1 });
    expect(backgroundSize(10, 40_000)).toEqual({ width: 1, height: 1080 });
    const { width, height } = backgroundSize(1921, 1081);
    expect(width).toBeLessThanOrEqual(1920);
    expect(height).toBeLessThanOrEqual(1080);
  });
});
