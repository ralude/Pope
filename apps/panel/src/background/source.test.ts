import { describe, expect, it } from 'vitest';

import { BackgroundError, inspectBackgroundSource, validateBackgroundSource } from './source.js';

/** Cabecera de un PNG armada a mano: firma y bloque IHDR con ancho y alto de 4 bytes. */
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** Un bloque JPEG: marcador, longitud (que cuenta sus 2 bytes) y contenido. */
function jpegSegment(marker: number, payload: Uint8Array): Uint8Array {
  const segment = new Uint8Array(4 + payload.length);
  segment.set([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]);
  segment.set(payload, 4);
  return segment;
}

/**
 * Cabecera de un JPEG armada a mano: SOI, metadatos (APP0 y un APP1 de 3000 bytes, como un
 * EXIF con miniatura) y el bloque SOF con alto y ancho de 2 bytes, en ese orden.
 */
function jpegHeader(width: number, height: number, sof = 0xc0): Uint8Array {
  const frame = new Uint8Array(15);
  const view = new DataView(frame.buffer);
  frame[0] = 8; // precisión: 8 bits por canal
  view.setUint16(1, height);
  view.setUint16(3, width);
  frame[5] = 3; // tres componentes de color
  const parts = [
    new Uint8Array([0xff, 0xd8]),
    jpegSegment(0xe0, new Uint8Array(14)),
    jpegSegment(0xe1, new Uint8Array(3000)),
    jpegSegment(sof, frame),
  ];
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

/** Cabecera RIFF/WEBP con un único bloque: tipo de 4 letras, longitud y contenido. */
function webpHeader(fourCc: string, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(20 + payload.length);
  const text = new TextEncoder();
  bytes.set(text.encode('RIFF'), 0);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  bytes.set(text.encode('WEBP'), 8);
  bytes.set(text.encode(fourCc), 12);
  new DataView(bytes.buffer).setUint32(16, payload.length, true);
  bytes.set(payload, 20);
  return bytes;
}

/** WebP sin pérdida (VP8L): firma 0x2f y, en 14 bits cada uno, ancho-1 y alto-1. */
function webpLosslessHeader(width: number, height: number): Uint8Array {
  const payload = new Uint8Array(10);
  payload[0] = 0x2f;
  new DataView(payload.buffer).setUint32(1, ((width - 1) | ((height - 1) << 14)) >>> 0, true);
  return webpHeader('VP8L', payload);
}

/** WebP con pérdida (VP8): etiqueta de fotograma, código 9d 01 2a y ancho y alto de 16 bits. */
function webpLossyHeader(width: number, height: number): Uint8Array {
  const payload = new Uint8Array(10);
  payload.set([0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a]);
  new DataView(payload.buffer).setUint16(6, width, true);
  new DataView(payload.buffer).setUint16(8, height, true);
  return webpHeader('VP8 ', payload);
}

/** WebP extendido (VP8X): banderas, 3 bytes reservados y lienzo (ancho-1, alto-1) de 24 bits. */
function webpExtendedHeader(width: number, height: number): Uint8Array {
  const payload = new Uint8Array(10);
  const view = new DataView(payload.buffer);
  view.setUint16(4, (width - 1) & 0xffff, true);
  payload[6] = (width - 1) >> 16;
  view.setUint16(7, (height - 1) & 0xffff, true);
  payload[9] = (height - 1) >> 16;
  return webpHeader('VP8X', payload);
}

describe('encabezado del original del fondo (REQ-003-76)', () => {
  it('lee el tipo y las dimensiones de un PNG, también vertical y en el límite de píxeles', () => {
    expect(inspectBackgroundSource(pngHeader(1920, 1080))).toEqual({
      mimeType: 'image/png',
      width: 1920,
      height: 1080,
    });
    // Vertical: 5000×8000 son justo 40 millones de píxeles.
    expect(inspectBackgroundSource(pngHeader(5000, 8000))).toEqual({
      mimeType: 'image/png',
      width: 5000,
      height: 8000,
    });
  });

  it('lee el tipo y las dimensiones de un JPEG tras sus metadatos, base o progresivo', () => {
    expect(inspectBackgroundSource(jpegHeader(4000, 3000))).toEqual({
      mimeType: 'image/jpeg',
      width: 4000,
      height: 3000,
    });
    // Vertical y progresivo (SOF2): el alto va antes que el ancho en el bloque.
    expect(inspectBackgroundSource(jpegHeader(1080, 1920, 0xc2))).toEqual({
      mimeType: 'image/jpeg',
      width: 1080,
      height: 1920,
    });
  });

  it('lee el tipo y las dimensiones de un WebP sin pérdida, con pérdida y extendido', () => {
    expect(inspectBackgroundSource(webpLosslessHeader(1920, 1080))).toEqual({
      mimeType: 'image/webp',
      width: 1920,
      height: 1080,
    });
    expect(inspectBackgroundSource(webpLossyHeader(4000, 3000))).toEqual({
      mimeType: 'image/webp',
      width: 4000,
      height: 3000,
    });
    // El lienzo extendido usa 24 bits por lado: 20000 no cabe en los 14 bits de VP8L.
    expect(inspectBackgroundSource(webpExtendedHeader(20_000, 1500))).toEqual({
      mimeType: 'image/webp',
      width: 20_000,
      height: 1500,
    });
  });
});

describe('límites del original del fondo (REQ-003-76)', () => {
  it('rechaza más de 10 MB con el motivo en español; 10 MB justos se aceptan', () => {
    expect(validateBackgroundSource(pngHeader(1920, 1080), 10_000_000)).toEqual({
      mimeType: 'image/png',
      width: 1920,
      height: 1080,
    });

    const attempt = () => validateBackgroundSource(pngHeader(1920, 1080), 10_000_001);
    expect(attempt).toThrow(BackgroundError);
    expect(attempt).toThrow('La imagen pesa más de 10 MB.');
  });

  it('rechaza más de 40 millones de píxeles, horizontal o vertical; 40 millones justos se aceptan', () => {
    // 8000×5000 y 5000×8000 son exactamente 40 millones de píxeles.
    expect(validateBackgroundSource(pngHeader(8000, 5000), 9_000_000)).toMatchObject({
      width: 8000,
      height: 5000,
    });
    expect(validateBackgroundSource(pngHeader(5000, 8000), 9_000_000)).toMatchObject({
      width: 5000,
      height: 8000,
    });

    // Un píxel de más en cualquier lado: 8001×5000, 5000×8001 y una tira de 40001×1000.
    for (const header of [pngHeader(8001, 5000), pngHeader(5000, 8001), pngHeader(40_001, 1000)]) {
      const attempt = () => validateBackgroundSource(header, 9_000_000);
      expect(attempt).toThrow(BackgroundError);
      expect(attempt).toThrow('La imagen tiene más de 40 millones de píxeles.');
    }
  });

  it('rechaza un formato que no es JPG, PNG ni WebP con el motivo en español', () => {
    const ascii = (text: string) => new TextEncoder().encode(text.padEnd(40, '\0'));
    // RIFF pero de audio (WAVE), no de imagen.
    const wave = webpHeader('fmt ', new Uint8Array(16));
    wave.set(new TextEncoder().encode('WAVE'), 8);
    const notSupported = [
      ascii('GIF89a'),
      ascii('BM'),
      ascii('Esto es un texto, no una imagen'),
      wave,
      new Uint8Array(0),
    ];
    for (const header of notSupported) {
      const attempt = () => validateBackgroundSource(header, 1000);
      expect(attempt).toThrow(BackgroundError);
      expect(attempt).toThrow('Elige una imagen JPG, PNG o WebP.');
    }
  });

  it('rechaza una imagen JPG, PNG o WebP con la cabecera dañada, con el motivo en español', () => {
    const png = pngHeader(1920, 1080);
    const damaged = [
      png.subarray(0, 20), // PNG cortado antes de sus dimensiones
      pngHeader(0, 0), // PNG con dimensiones nulas
      new Uint8Array([0xff, 0xd8]), // JPEG solo con el inicio
      jpegHeader(4000, 3000).subarray(0, 100), // JPEG cortado antes de su SOF
      webpHeader('VP8L', new Uint8Array(10)), // WebP sin la firma de VP8L
      webpHeader('JUNK', new Uint8Array(20)), // WebP con un bloque desconocido
      webpLosslessHeader(1920, 1080).subarray(0, 22), // WebP cortado
    ];
    for (const header of damaged) {
      const attempt = () => validateBackgroundSource(header, 1000);
      expect(attempt).toThrow(BackgroundError);
      expect(attempt).toThrow('No se pudo leer la imagen.');
    }
  });
});
