import type { LockBackgroundImage } from '@pope/shared';
import { describe, expect, it } from 'vitest';

import { backgroundUrl } from './background.js';

const image: LockBackgroundImage = {
  sha256: '0123456789abcdef'.repeat(4),
  size: 1234,
  mimeType: 'image/webp',
  width: 1280,
  height: 720,
};

describe('URL del fondo de bloqueo (REQ-003-73)', () => {
  it('es el host de fondos del host nativo con el nombre <huella>.webp', () => {
    expect(backgroundUrl(image)).toBe(
      'https://background.pope.invalid/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.webp',
    );
  });

  it('sin imagen no hay URL: se usa el fondo de Pope', () => {
    expect(backgroundUrl(null)).toBeNull();
  });

  it('nunca construye una URL con algo que no sea una huella', () => {
    for (const sha256 of [
      '../secreto',
      `${'a'.repeat(63)}/`,
      `${'a'.repeat(60)}.png`,
      'A'.repeat(64),
      'a'.repeat(63),
      'a'.repeat(65),
      '',
      `${'a'.repeat(63)}٣`,
    ])
      expect(backgroundUrl({ ...image, sha256 })).toBeNull();
  });
});
