// Prepara el fondo de bloqueo en el navegador (REQ-003-76): comprueba el original por su
// encabezado, lo reduce con `<canvas>` a 1920×1080 como mucho y lo comprime a WebP de 2 MB.
// El nodo no procesa imágenes (ADR-0011). Solo se puede ejecutar en el navegador; la lógica
// que decide cada paso está en `source.ts`, `size.ts` y `encode.ts`, con sus pruebas.
import { pickEncoding } from './encode.js';
import { backgroundSize } from './size.js';
import { BackgroundError, validateBackgroundSource } from './source.js';

/** Tipos que se pueden elegir en el selector de archivos. */
export const BACKGROUND_ACCEPT = 'image/jpeg,image/png,image/webp';

/** Bytes del principio del archivo que se leen para su encabezado (cubre metadatos EXIF típicos). */
const HEADER_BYTES = 64 * 1024;

export interface PreparedBackground {
  /** WebP listo para subir. */
  blob: Blob;
  width: number;
  height: number;
}

export async function prepareBackground(file: File): Promise<PreparedBackground> {
  // Antes de decodificar nada: peso, formato y dimensiones salen del encabezado.
  const header = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  validateBackgroundSource(header, file.size);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new BackgroundError('No se pudo leer la imagen.');
  }
  // El tamaño sale del bitmap ya orientado (un JPEG de móvil puede venir girado por EXIF).
  const size = backgroundSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new BackgroundError('Este navegador no puede preparar la imagen.');
  }
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();

  const blob = await pickEncoding(
    (quality) =>
      new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/webp', quality);
      }),
  );
  return { blob, ...size };
}
