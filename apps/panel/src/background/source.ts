// Original del fondo de bloqueo (REQ-003-70, REQ-003-76): antes de decodificar nada, el panel
// lee solo el encabezado del archivo para saber su tipo y sus dimensiones. Así una imagen
// enorme se rechaza sin reservar la memoria que pediría decodificarla.

import { isBackgroundSourceWithinLimits, MAX_BACKGROUND_SOURCE_BYTES } from '@pope/shared';

/** Un original que no se puede usar, con el motivo para el administrador. */
export class BackgroundError extends Error {}

/** Tipos de original que acepta el panel (REQ-003-76). */
export type BackgroundSourceMime = 'image/jpeg' | 'image/png' | 'image/webp';

export interface BackgroundSource {
  mimeType: BackgroundSourceMime;
  width: number;
  height: number;
}

/** Firma de ocho bytes con la que empieza todo PNG. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Una imagen JPG, PNG o WebP a la que le falta algo en la cabecera o la tiene dañada. */
const unreadable = () => new BackgroundError('No se pudo leer la imagen.');

/**
 * Tipo y dimensiones del original a partir de los primeros bytes del archivo. Lanza
 * `BackgroundError` si no es JPG, PNG ni WebP o si su cabecera no se puede leer.
 */
export function inspectBackgroundSource(header: Uint8Array): BackgroundSource {
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  let source: BackgroundSource;
  if (PNG_SIGNATURE.every((byte, index) => header[index] === byte)) {
    if (header.length < 24) throw unreadable();
    // El primer bloque, IHDR, guarda ancho y alto en 4 bytes cada uno, tras su longitud y nombre.
    source = { mimeType: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
  } else if (header[0] === 0xff && header[1] === 0xd8) {
    source = { mimeType: 'image/jpeg', ...jpegDimensions(view) };
  } else if (ascii(header, 0, 4) === 'RIFF' && ascii(header, 8, 12) === 'WEBP') {
    source = { mimeType: 'image/webp', ...webpDimensions(header, view) };
  } else {
    throw new BackgroundError('Elige una imagen JPG, PNG o WebP.');
  }
  // Una imagen sin superficie no es utilizable ni cabe en la regla de píxeles.
  if (source.width === 0 || source.height === 0) throw unreadable();
  return source;
}

/**
 * Comprueba los límites del original con lo que ya se sabe sin decodificarlo (REQ-003-76):
 * su peso y el encabezado. Lanza `BackgroundError` con el motivo si no se puede usar.
 */
export function validateBackgroundSource(header: Uint8Array, fileSize: number): BackgroundSource {
  if (fileSize > MAX_BACKGROUND_SOURCE_BYTES) {
    throw new BackgroundError('La imagen pesa más de 10 MB.');
  }
  const source = inspectBackgroundSource(header);
  if (!isBackgroundSourceWithinLimits(fileSize, source.width, source.height)) {
    throw new BackgroundError('La imagen tiene más de 40 millones de píxeles.');
  }
  return source;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/**
 * Ancho y alto de un WebP según el primer bloque, que empieza en el byte 20 tras la cabecera
 * RIFF (12 bytes) y el nombre y longitud del bloque (8):
 * - `VP8L` (sin pérdida): firma 0x2f y, en 14 bits cada uno, ancho-1 y alto-1.
 * - `VP8 ` (con pérdida): tras el código de inicio 9d 01 2a, ancho y alto en 16 bits (14 útiles).
 * - `VP8X` (extendido): tras banderas y 3 bytes reservados, lienzo menos 1 en 24 bits cada lado.
 */
function webpDimensions(header: Uint8Array, view: DataView): { width: number; height: number } {
  const kind = ascii(header, 12, 16);
  if (kind === 'VP8L' && header[20] === 0x2f && header.length >= 25) {
    const bits = view.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8 ' && header.length >= 30 && header[23] === 0x9d && header[24] === 0x01) {
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }
  if (kind === 'VP8X' && header.length >= 30) {
    return {
      width: view.getUint16(24, true) + (header[26] ?? 0) * 0x10000 + 1,
      height: view.getUint16(27, true) + (header[29] ?? 0) * 0x10000 + 1,
    };
  }
  throw unreadable();
}

/**
 * Ancho y alto de un JPEG: se saltan los bloques de metadatos (marcador, longitud) hasta el
 * SOF, que trae precisión (1 byte), alto (2) y ancho (2). Son SOF los marcadores C0 a CF
 * salvo C4 (tablas Huffman), C8 y CC (reservados y aritmética), que no describen la imagen.
 */
function jpegDimensions(view: DataView): { width: number; height: number } {
  let offset = 2;
  while (offset + 4 <= view.byteLength && view.getUint8(offset) === 0xff) {
    const marker = view.getUint8(offset + 1);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (offset + 9 > view.byteLength) break;
      return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
    }
    offset += 2 + view.getUint16(offset + 2);
  }
  throw unreadable();
}
