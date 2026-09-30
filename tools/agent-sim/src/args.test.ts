import { usd } from '@pope/shared';
import { describe, expect, it } from 'vitest';

import { parsePcRange, parsePositiveInt, parseUsdAmount, simUsername, UsageError } from './args.js';

describe('rango de PCs', () => {
  it('lee un número, un rango, una lista y combinaciones, ordenados y sin repetir', () => {
    expect(parsePcRange('5')).toEqual([5]);
    expect(parsePcRange('1-5')).toEqual([1, 2, 3, 4, 5]);
    expect(parsePcRange('1,3,7')).toEqual([1, 3, 7]);
    expect(parsePcRange('1-3, 7, 2-4')).toEqual([1, 2, 3, 4, 7]);
    expect(parsePcRange('1-40')).toHaveLength(40);
  });

  it('explica en español lo que está mal', () => {
    expect(() => parsePcRange('')).toThrow('Rango de PCs no válido');
    expect(() => parsePcRange('a-b')).toThrow(UsageError);
    expect(() => parsePcRange('1-')).toThrow('usa 1-5 o 1,3,7');
    expect(() => parsePcRange('5-1')).toThrow('está al revés');
    expect(() => parsePcRange('0')).toThrow('La PC 0 no existe (de 1 a 99)');
    expect(() => parsePcRange('90-100')).toThrow('La PC 100 no existe');
  });
});

describe('importes y números', () => {
  it('lee dólares con punto o con coma', () => {
    expect(parseUsdAmount('3')).toBe(usd(3));
    expect(parseUsdAmount('0.05')).toBe(usd(0.05));
    expect(parseUsdAmount('1,5')).toBe(usd(1.5));
    for (const bad of ['', 'abc', '0', '-2']) {
      expect(() => parseUsdAmount(bad)).toThrow('Importe no válido');
    }
  });

  it('exige enteros positivos', () => {
    expect(parsePositiveInt('40', '--customers')).toBe(40);
    for (const bad of ['0', '-1', '2.5', 'x']) {
      expect(() => parsePositiveInt(bad, '--customers')).toThrow('--customers debe ser');
    }
  });

  it('los usuarios de prueba llevan dos cifras', () => {
    expect(simUsername(5)).toBe('sim05');
    expect(simUsername(40)).toBe('sim40');
  });
});
