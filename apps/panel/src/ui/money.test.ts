import { usd } from '@pope/shared';
import { describe, expect, it } from 'vitest';

import { formatUsdInput, parseUsd } from './money.js';

describe('parseUsd', () => {
  it('lee el importe con coma o con punto', () => {
    expect(parseUsd('5')).toBe(usd(5));
    expect(parseUsd('5,5')).toBe(usd(5.5));
    expect(parseUsd(' 5,50 ')).toBe(usd(5.5));
    expect(parseUsd('0.75')).toBe(usd(0.75));
    expect(parseUsd('1234,05')).toBe(usd(1234.05));
  });

  it('rechaza lo que no es un importe en céntimos mayor que cero', () => {
    for (const text of ['', '0', '0,00', '-1', '1,234', 'abc', '1.000,00', '5 USD']) {
      expect(parseUsd(text), text).toBeNull();
    }
  });
});

describe('formatUsdInput', () => {
  it('escribe el importe como se teclea', () => {
    expect(formatUsdInput(usd(5))).toBe('5,00');
    expect(formatUsdInput(usd(0.75))).toBe('0,75');
    expect(formatUsdInput(usd(12.4))).toBe('12,40');
  });
});
