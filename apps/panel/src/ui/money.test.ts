import { usd } from '@pope/shared';
import { describe, expect, it } from 'vitest';

import { formatUsdInput, parseAmount, parseUsd } from './money.js';

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

describe('importes contados en la caja (REQ-005-40, REQ-005-42)', () => {
  it('admiten 0, decimales con coma o punto y miles con punto', () => {
    expect(parseAmount('0')).toBe(0);
    expect(parseAmount('25')).toBe(25_000_000);
    expect(parseAmount('25,5')).toBe(25_500_000);
    expect(parseAmount('25.50')).toBe(25_500_000);
    expect(parseAmount('12500')).toBe(12_500_000_000);
    expect(parseAmount('12.500')).toBe(12_500_000_000);
    expect(parseAmount('12.500,50')).toBe(12_500_500_000);
    expect(parseAmount('1.234.567,8')).toBe(1_234_567_800_000);
  });

  it('rechazan lo que no es un importe', () => {
    for (const text of ['', 'abc', '-5', '1,234.5', '12.50.0', '25,555', '1.2345']) {
      expect(parseAmount(text)).toBeNull();
    }
  });
});
