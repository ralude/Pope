export interface WebpDimensions {
  width: number;
  height: number;
}

/**
 * Ancho y alto de un WebP, leídos de su primer bloque sin decodificar la imagen (el nodo no
 * procesa imágenes, ADR-0011). `null` si el bloque no se entiende o está truncado.
 */
export function webpDimensions(body: Buffer): WebpDimensions | null {
  const kind = body.toString('ascii', 12, 16);
  if (kind === 'VP8L' && body.length >= 25 && body[20] === 0x2f) {
    // Lossless: tras la firma 0x2f, ancho-1 y alto-1 en 14 bits cada uno.
    const bits = body.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (
    kind === 'VP8 ' &&
    body.length >= 30 &&
    body[23] === 0x9d &&
    body[24] === 0x01 &&
    body[25] === 0x2a
  ) {
    // Con pérdida: tras el código de inicio 9d 01 2a, ancho y alto en 14 bits (los otros 2 son escala).
    return { width: body.readUInt16LE(26) & 0x3fff, height: body.readUInt16LE(28) & 0x3fff };
  }
  if (kind === 'VP8X' && body.length >= 30) {
    // Extendido: tras banderas y 3 bytes reservados, tamaño del lienzo menos 1 en 24 bits.
    return { width: body.readUIntLE(24, 3) + 1, height: body.readUIntLE(27, 3) + 1 };
  }
  return null;
}
