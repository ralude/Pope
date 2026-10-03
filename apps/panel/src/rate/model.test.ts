import { type ExchangeRate, vesRate } from '@pope/shared';
import { describe, expect, it } from 'vitest';

import { parseVesRate, rateOrigin, ratePill, rateText, weekdayOf } from './model.js';

const RATE: ExchangeRate = {
  vesPerUsd: vesRate(40_000_000),
  effectiveDate: '2026-09-28',
  source: 'manual',
  obtainedAt: '2026-09-28T19:20:00.000Z',
  setBy: 'Ana',
};

describe('lectura de la tasa (REQ-005-34)', () => {
  it('lee Bs por 1 USD con coma o punto y hasta 6 decimales', () => {
    expect(parseVesRate('40')).toBe(40_000_000);
    expect(parseVesRate(' 40,5 ')).toBe(40_500_000);
    expect(parseVesRate('36.5432')).toBe(36_543_200);
    expect(parseVesRate('36,123456')).toBe(36_123_456);
  });

  it('rechaza lo que no es una tasa', () => {
    for (const text of ['', '0', '0,000000', 'abc', '-40', '40,1234567', '1.234,56', '40 Bs']) {
      expect(parseVesRate(text)).toBeNull();
    }
  });
});

describe('píldora de la tasa (REQ-005-35, REQ-005-36)', () => {
  it('con tasa vigente: «Tasa · 1 USD = 40,00 Bs»', () => {
    expect(ratePill({ rate: RATE, stale: false })).toEqual({
      text: 'Tasa · 1 USD = 40,00 Bs',
      warn: false,
    });
    expect(rateText(vesRate(36_543_200))).toBe('1 USD = 36,54 Bs');
  });

  it('sin tasa avisa en ámbar', () => {
    expect(ratePill({ rate: null, stale: false })).toEqual({ text: 'Sin tasa', warn: true });
  });

  it('CA-005-05: desactualizada dice de qué día es', () => {
    expect(weekdayOf('2026-09-28')).toBe('lunes');
    expect(ratePill({ rate: RATE, stale: true })).toEqual({ text: 'Tasa del lunes', warn: true });
  });

  it('dice la fuente, quién y cuándo, en hora de Caracas', () => {
    expect(rateOrigin(RATE)).toBe('Manual, guardada por Ana el 28/9, 15:20');
    expect(rateOrigin({ ...RATE, source: 'bcv', setBy: null })).toBe(
      'BCV, obtenida el 28/9, 15:20',
    );
  });
});
