import { describe, expect, it } from 'vitest';

import { pickEncoding } from './encode.js';
import { BackgroundError } from './source.js';

/** Un blob de `size` bytes con el tipo que dice el navegador al codificar. */
const blob = (size: number, type = 'image/webp') => new Blob([new Uint8Array(size)], { type });

describe('compresión del fondo a WebP de 2 MB como mucho (REQ-003-76)', () => {
  it('elige la primera calidad que cabe, de mejor a peor, y no sigue probando', async () => {
    const tried: number[] = [];
    const picked = await pickEncoding((quality) => {
      tried.push(quality);
      // Pesa 3 MB a 0.85, 2 000 001 bytes a 0.7 (uno de más) y cabe a 0.55.
      const size = quality === 0.85 ? 3_000_000 : quality === 0.7 ? 2_000_001 : 1_900_000;
      return Promise.resolve(blob(size));
    });

    expect(picked.size).toBe(1_900_000);
    expect(tried).toEqual([0.85, 0.7, 0.55]);
  });

  it('acepta justo 2 000 000 bytes', async () => {
    const picked = await pickEncoding(() => Promise.resolve(blob(2_000_000)));
    expect(picked.size).toBe(2_000_000);
  });

  it('avisa en español si el navegador no puede codificar WebP', async () => {
    // Algunos navegadores devuelven `null`, y otros un PNG cuando no soportan WebP.
    for (const result of [null, blob(1000, 'image/png')]) {
      const attempt = pickEncoding(() => Promise.resolve(result));
      await expect(attempt).rejects.toBeInstanceOf(BackgroundError);
      await expect(attempt).rejects.toThrow('Este navegador no puede preparar la imagen en WebP.');
    }
  });

  it('avisa en español si no cabe en 2 MB ni con la peor calidad', async () => {
    const tried: number[] = [];
    const attempt = pickEncoding((quality) => {
      tried.push(quality);
      return Promise.resolve(blob(2_000_001));
    });

    await expect(attempt).rejects.toBeInstanceOf(BackgroundError);
    await expect(attempt).rejects.toThrow('La imagen sigue pesando más de 2 MB. Prueba con otra.');
    expect(tried).toEqual([0.85, 0.7, 0.55, 0.4]);
  });
});
