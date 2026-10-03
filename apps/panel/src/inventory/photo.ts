// Foto de un producto (REQ-005-03, REQ-005-73): el panel la reduce en el navegador, con
// `<canvas>`, a 512 px de lado como mucho y en WebP, antes de subirla. El nodo no procesa
// imágenes (ADR-0011) y no acepta más de 512 KB.
import { PRODUCT_PHOTO_MAX_BYTES, PRODUCT_PHOTO_MAX_SIDE, PRODUCT_PHOTO_TYPE } from '@pope/shared';

/** Tipos que se pueden elegir (REQ-005-03). */
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';

/** Calidades WebP que se prueban, de mejor a peor, hasta que la foto quepa. */
const QUALITIES = [0.85, 0.7, 0.55, 0.4];

/** Tamaño reducido: el lado mayor como mucho `max`, sin agrandar y sin deformar. */
export function photoSize(
  width: number,
  height: number,
  max = PRODUCT_PHOTO_MAX_SIDE,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Un fallo al preparar la foto, con un mensaje para el personal. */
export class PhotoError extends Error {}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, PRODUCT_PHOTO_TYPE, quality);
  });
}

/** Reduce la foto elegida a WebP de 512 px y 512 KB como mucho. Solo en el navegador. */
export async function shrinkPhoto(file: File): Promise<Blob> {
  if (!PHOTO_ACCEPT.split(',').includes(file.type)) {
    throw new PhotoError('Elige una foto JPG, PNG o WebP.');
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new PhotoError('No se pudo abrir esa foto.');
  }
  const size = photoSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  for (const quality of QUALITIES) {
    const blob = await toBlob(canvas, quality);
    if (blob?.type !== PRODUCT_PHOTO_TYPE) {
      throw new PhotoError('Este navegador no puede preparar la foto en WebP.');
    }
    if (blob.size <= PRODUCT_PHOTO_MAX_BYTES) {
      return blob;
    }
  }
  throw new PhotoError('La foto sigue siendo demasiado grande. Prueba con otra.');
}
