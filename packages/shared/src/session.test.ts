import { describe, expect, it } from 'vitest';

import { idSchema, newId } from './session.js';

describe('newId (ADR-0008)', () => {
  it('genera UUIDv7 válidos', () => {
    expect(idSchema.safeParse(newId()).success).toBe(true);
  });

  it('los ids salen en orden y sin repetirse', () => {
    const ids = Array.from({ length: 1000 }, () => newId());
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });
});
