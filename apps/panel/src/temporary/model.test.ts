import { usd } from '@pope/shared';
import { describe, expect, it } from 'vitest';

import { chargeOf, lossText, minutesLabel, parseMinutes } from './model.js';

describe('cobro de una sesión temporal (REQ-001-60, REQ-001-70)', () => {
  it('por minutos cobra al céntimo más cercano', () => {
    expect(chargeOf('minutes', '60', usd(1.5))).toEqual({
      body: { minutes: 60 },
      purchase: { seconds: 3600, charge: usd(1.5) },
    });
    // 25 min a 1,50 USD/h = 0,625 → 0,63 USD.
    expect(chargeOf('minutes', '25', usd(1.5))?.purchase.charge).toBe(usd(0.63));
  });

  it('CA-001-10: 0,75 USD a 1,50 USD/h dan 30 min', () => {
    expect(chargeOf('amount', '0,75', usd(1.5))).toEqual({
      body: { amountMicros: usd(0.75) },
      purchase: { seconds: 1800, charge: usd(0.75) },
    });
  });

  it('rechaza lo que no vale o pasa de 24 h', () => {
    expect(chargeOf('minutes', '0', usd(1.5))).toBeNull();
    expect(chargeOf('minutes', '1441', usd(1.5))).toBeNull();
    expect(chargeOf('minutes', '1,5', usd(1.5))).toBeNull();
    expect(chargeOf('amount', '', usd(1.5))).toBeNull();
    expect(chargeOf('amount', '37', usd(1.5))).toBeNull();
    expect(parseMinutes('1440')).toBe(1440);
  });
});

describe('textos', () => {
  it('escribe los minutos como en el diseño', () => {
    expect(minutesLabel(30)).toBe('30 min');
    expect(minutesLabel(60)).toBe('1 h');
    expect(minutesLabel(125)).toBe('2 h 05 min');
  });

  it('dice cuánto se pierde al cerrar (REQ-001-69)', () => {
    expect(lossText(25 * 60 + 40)).toBe('25 min');
    expect(lossText(65 * 60)).toBe('1 h 05 min');
    expect(lossText(30)).toBe('menos de 1 min');
  });
});
