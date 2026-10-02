import { describe, expect, it } from 'vitest';

import {
  formatBolivares,
  formatMoney,
  micros,
  microsSchema,
  moneySchema,
  roundToCents,
  usd,
  usdToVes,
  vesRate,
  vesRateSchema,
} from './money.js';

describe('micro-unidades (ADR-0015)', () => {
  it('usd() convierte dólares a µUSD', () => {
    expect(usd(1.5)).toBe(1_500_000);
    expect(usd(2)).toBe(2_000_000);
    expect(usd(0.01)).toBe(10_000);
    expect(usd(-2.25)).toBe(-2_250_000);
  });

  it('usd() corrige el error de coma flotante al convertir', () => {
    // 1,005 × 1 000 000 da 1 004 999,999… en coma flotante.
    expect(usd(1.005)).toBe(1_005_000);
    expect(usd(0.1 + 0.2)).toBe(300_000);
  });

  it('rechaza importes no enteros o fuera del rango seguro', () => {
    expect(() => micros(1.5)).toThrow(RangeError);
    expect(() => micros(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
    expect(() => micros(Number.NaN)).toThrow(RangeError);
    expect(() => usd(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(microsSchema.safeParse(1.5).success).toBe(false);
    expect(microsSchema.safeParse('1500000').success).toBe(false);
    expect(microsSchema.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(false);
    expect(microsSchema.safeParse(-1_500_000).success).toBe(true);
  });

  it('un importe con moneda solo admite USD o VES', () => {
    expect(moneySchema.safeParse({ micros: 1_500_000, currency: 'USD' }).success).toBe(true);
    expect(moneySchema.safeParse({ micros: 1_500_000, currency: 'EUR' }).success).toBe(false);
    expect(moneySchema.safeParse({ micros: 1.5, currency: 'USD' }).success).toBe(false);
  });

  it('una tasa de cambio es un entero positivo', () => {
    expect(vesRateSchema.safeParse(40_000_000).success).toBe(true);
    expect(vesRateSchema.safeParse(0).success).toBe(false);
    expect(vesRateSchema.safeParse(40.5).success).toBe(false);
  });
});

describe('redondeo a céntimos al mostrar (REQ-001-23)', () => {
  it('redondea al céntimo más cercano, la mitad hacia arriba', () => {
    expect(roundToCents(micros(2_245_833))).toBe(225);
    expect(roundToCents(micros(2_244_999))).toBe(224);
    expect(roundToCents(micros(2_245_000))).toBe(225);
    expect(roundToCents(micros(4_999))).toBe(0);
    expect(roundToCents(micros(5_000))).toBe(1);
  });

  it('en negativos redondea igual en valor absoluto', () => {
    expect(roundToCents(micros(-2_245_000))).toBe(-225);
    expect(roundToCents(micros(-2_244_999))).toBe(-224);
    expect(Object.is(roundToCents(micros(-1)), 0)).toBe(true);
  });
});

describe('formatMoney (REQ-001-12, REQ-001-13, REQ-001-23)', () => {
  it('muestra USD con dos decimales y coma decimal', () => {
    expect(formatMoney(usd(3))).toBe('3,00 USD');
    expect(formatMoney(usd(2.25))).toBe('2,25 USD');
    expect(formatMoney(micros(0))).toBe('0,00 USD');
  });

  it('REQ-001-23: 10 min 20 s a 1,50 USD/h (0,258333 USD) se muestran como 0,26 USD', () => {
    expect(formatMoney(micros(258_333))).toBe('0,26 USD');
  });

  it('separa los miles con punto', () => {
    expect(formatMoney(usd(1234.56))).toBe('1.234,56 USD');
    expect(formatMoney(usd(1_234_567.89))).toBe('1.234.567,89 USD');
    expect(formatMoney(usd(999.99))).toBe('999,99 USD');
  });

  it('muestra el signo de los negativos, pero nunca "-0,00"', () => {
    expect(formatMoney(usd(-2.25))).toBe('-2,25 USD');
    expect(formatMoney(micros(-1))).toBe('0,00 USD');
  });

  it('REQ-001-13: añade el equivalente en bolívares, escrito «Bs», si hay tasa', () => {
    const rate = vesRate(40_000_000); // 40 VES/USD
    expect(formatMoney(usd(3), { vesRate: rate })).toBe('3,00 USD (≈ 120,00 Bs)');
    expect(formatMoney(usd(1234.56), { vesRate: rate })).toBe('1.234,56 USD (≈ 49.382,40 Bs)');
  });

  it('REQ-001-13: el equivalente en bolívares también se puede mostrar solo', () => {
    const rate = vesRate(40_000_000);
    expect(formatBolivares(usd(2.96), rate)).toBe('≈ 118,40 Bs');
    expect(formatBolivares(usd(25), rate)).toBe('≈ 1.000,00 Bs');
    expect(formatBolivares(usd(1.5), rate, '/h')).toBe('≈ 60,00 Bs/h');
  });

  it('REQ-001-13: sin tasa solo muestra USD', () => {
    expect(formatMoney(usd(3), { vesRate: undefined })).toBe('3,00 USD');
  });

  it('admite un sufijo para tarifas', () => {
    expect(formatMoney(usd(1.5), { suffix: '/h' })).toBe('1,50 USD/h');
    expect(formatMoney(usd(1.5), { suffix: '/h', vesRate: vesRate(40_000_000) })).toBe(
      '1,50 USD/h (≈ 60,00 Bs/h)',
    );
  });
});

describe('usdToVes', () => {
  it('convierte con la tasa y redondea al micro', () => {
    expect(usdToVes(usd(1), vesRate(40_000_000))).toBe(40_000_000);
    // 0,000001 USD × 36,5 VES/USD = 0,0000365 VES → 0,000037 VES.
    expect(usdToVes(micros(1), vesRate(36_500_000))).toBe(37);
  });

  it('no pierde precisión aunque el producto supere el entero seguro', () => {
    // 1 000 000 USD a 400 VES/USD: el producto intermedio es 4·10²⁰.
    expect(usdToVes(usd(1_000_000), vesRate(400_000_000))).toBe(400_000_000 * 1_000_000);
  });
});
