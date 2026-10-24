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
  return null;
}
