import { describe, expect, it } from 'vitest';

import { photoSize } from './photo.js';

describe('tamaño de la foto del producto (REQ-005-03, REQ-005-73)', () => {
  it('reduce el lado mayor a 512 px sin deformarla', () => {
    expect(photoSize(4000, 3000)).toEqual({ width: 512, height: 384 });
    expect(photoSize(1080, 1920)).toEqual({ width: 288, height: 512 });
  });

  it('no agranda una foto pequeña', () => {
    expect(photoSize(300, 200)).toEqual({ width: 300, height: 200 });
  });

  it('nunca deja un lado en 0', () => {
    expect(photoSize(10_000, 3)).toEqual({ width: 512, height: 1 });
  });
});
