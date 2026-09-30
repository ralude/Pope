import { describe, expect, it } from 'vitest';

import { usd } from './money.js';
import {
  defaultTemporaryName,
  temporaryAddTimeRequestSchema,
  temporaryByAmount,
  temporaryByMinutes,
  temporaryOpenRequestSchema,
  temporaryPurchase,
} from './temporary.js';

const MONDAY_RATE = usd(1.5);
const PC = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a03';

describe('cobro por minutos (REQ-001-60, REQ-001-70)', () => {
  it('redondea al céntimo más cercano, la mitad hacia arriba, y da los minutos exactos', () => {
    // 25 min a 1,50 USD/h = 0,625 → 0,63 USD (pregunta resuelta de la spec).
    expect(temporaryByMinutes(25, MONDAY_RATE)).toEqual({ seconds: 1500, charge: usd(0.63) });
    expect(temporaryByMinutes(60, MONDAY_RATE)).toEqual({ seconds: 3600, charge: usd(1.5) });
    expect(temporaryByMinutes(30, MONDAY_RATE)).toEqual({ seconds: 1800, charge: usd(0.75) });
    // 1 min = 0,025 USD = 2,5 céntimos → 3.
    expect(temporaryByMinutes(1, MONDAY_RATE).charge).toBe(usd(0.03));
    // 10 min a 2,00 USD/h = 0,3333… → 0,33 USD.
    expect(temporaryByMinutes(10, usd(2)).charge).toBe(usd(0.33));
  });
});

describe('cobro por importe (REQ-001-60, REQ-001-70)', () => {
  it('cobra exactamente el importe y da los segundos que paga, truncados', () => {
    expect(temporaryByAmount(usd(0.75), MONDAY_RATE)).toEqual({ seconds: 1800, charge: usd(0.75) });
    expect(temporaryByAmount(usd(1), usd(2))).toEqual({ seconds: 1800, charge: usd(1) });
    // 0,01 USD a 1,50 USD/h = 24 s justos; 0,011 USD = 26,4 s → 26.
    expect(temporaryByAmount(usd(0.01), MONDAY_RATE).seconds).toBe(24);
    expect(temporaryByAmount(usd(0.011), MONDAY_RATE).seconds).toBe(26);
  });
});

describe('temporaryPurchase', () => {
  it('elige el cobro según lo que indica la petición', () => {
    expect(temporaryPurchase({ minutes: 25 }, MONDAY_RATE).charge).toBe(usd(0.63));
    expect(temporaryPurchase({ amountMicros: usd(0.75) }, MONDAY_RATE).seconds).toBe(1800);
    expect(() => temporaryPurchase({}, MONDAY_RATE)).toThrow(RangeError);
  });
});

describe('nombre por defecto (REQ-001-61)', () => {
  it('usa la PC y la hora del local', () => {
    // 22:30 UTC son las 18:30 en Caracas (UTC−4).
    expect(defaultTemporaryName('PC 05', new Date('2026-09-28T22:30:00Z'))).toBe(
      'Temporal · PC 05 · 18:30',
    );
    // A las 04:05 UTC son las 00:05 del local, con cero delante.
    expect(defaultTemporaryName('PC 12', new Date('2026-09-29T04:05:00Z'))).toBe(
      'Temporal · PC 12 · 00:05',
    );
  });
});

describe('cuerpos de las peticiones', () => {
  const valid = (body: unknown) => temporaryOpenRequestSchema.safeParse(body).success;

  it('la apertura pide el tiempo o el importe, pero solo uno', () => {
    const base = { pcId: PC, paymentMethod: 'cash_usd' };
    expect(valid({ ...base, minutes: 60 })).toBe(true);
    expect(valid({ ...base, amountMicros: usd(1.5) })).toBe(true);
    expect(valid(base)).toBe(false);
    expect(valid({ ...base, minutes: 60, amountMicros: usd(1.5) })).toBe(false);
  });

  it('valida los límites: minutos enteros hasta 24 h, importe positivo, nombre con texto', () => {
    const base = { pcId: PC, paymentMethod: 'pos' };
    expect(valid({ ...base, minutes: 0 })).toBe(false);
    expect(valid({ ...base, minutes: 1.5 })).toBe(false);
    expect(valid({ ...base, minutes: 1440 })).toBe(true);
    expect(valid({ ...base, minutes: 1441 })).toBe(false);
    expect(valid({ ...base, amountMicros: 0 })).toBe(false);
    expect(valid({ ...base, minutes: 30, name: '   ' })).toBe(false);
    expect(valid({ ...base, minutes: 30, name: 'Carlos' })).toBe(true);
    expect(valid({ ...base, minutes: 30, paymentMethod: 'bitcoin' })).toBe(false);
    expect(valid({ ...base, minutes: 30, extra: true })).toBe(false);
  });

  it('añadir tiempo tiene las mismas reglas, sin PC ni nombre', () => {
    const add = (body: unknown) => temporaryAddTimeRequestSchema.safeParse(body).success;
    expect(add({ paymentMethod: 'cash_usd', amountMicros: usd(0.75) })).toBe(true);
    expect(add({ paymentMethod: 'cash_usd', minutes: 30 })).toBe(true);
    expect(add({ paymentMethod: 'cash_usd' })).toBe(false);
    expect(add({ paymentMethod: 'cash_usd', minutes: 30, name: 'X' })).toBe(false);
  });
});
