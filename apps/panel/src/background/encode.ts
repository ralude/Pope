import { MAX_BACKGROUND_BYTES } from '@pope/shared';

import { BackgroundError } from './source.js';

/** Calidades WebP que se prueban, de mejor a peor, hasta que el fondo quepa. */
const QUALITIES = [0.85, 0.7, 0.55, 0.4];

/**
 * Elige la primera calidad cuyo WebP cabe en 2 MB (REQ-003-76). `encode` es la parte del
 * navegador (`canvas.toBlob`); se recibe como parámetro para poder probar la decisión sin él.
 */
export async function pickEncoding(
  encode: (quality: number) => Promise<Blob | null>,
): Promise<Blob> {
  for (const quality of QUALITIES) {
    const blob = await encode(quality);
    // Sin soporte de WebP, el navegador devuelve `null` o cae a otro formato (PNG).
    if (blob?.type !== 'image/webp') {
      throw new BackgroundError('Este navegador no puede preparar la imagen en WebP.');
    }
    if (blob.size <= MAX_BACKGROUND_BYTES) {
      return blob;
    }
  }
  throw new BackgroundError('La imagen sigue pesando más de 2 MB. Prueba con otra.');
}
