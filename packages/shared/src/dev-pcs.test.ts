import { describe, expect, it } from 'vitest';

import { devPcId, devPcName, MAX_DEV_PCS } from './dev-pcs.js';
import { idSchema } from './session.js';

describe('PCs de ejemplo (T35a)', () => {
  it('cada número da un id UUIDv7 válido y distinto, y un nombre con dos cifras', () => {
    expect(idSchema.safeParse(devPcId(1)).success).toBe(true);
    expect(idSchema.safeParse(devPcId(99)).success).toBe(true);
    expect(devPcId(5)).toBe('01900000-0000-7000-8000-000000000005');
    expect(devPcId(40)).not.toBe(devPcId(4));
    expect(devPcName(1)).toBe('PC 01');
    expect(devPcName(40)).toBe('PC 40');
    expect(devPcName(99)).toBe('PC 99');
  });

  it('acepta de 1 a 99 y rechaza el resto', () => {
    expect(MAX_DEV_PCS).toBe(99);
    for (const n of [0, 100, 1.5, -1, Number.NaN]) {
      expect(() => devPcId(n)).toThrow(RangeError);
      expect(() => devPcName(n)).toThrow(RangeError);
    }
  });
});
