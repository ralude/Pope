import { describe, expect, it } from 'vitest';

import {
  comboCreateRequestSchema,
  comboDiscounts,
  comboRatePerHour,
  comboUpdateRequestSchema,
} from './combo.js';
import { usd } from './money.js';
import type { TariffTable } from './tariff.js';
import { hours } from './time.js';

const table: TariffTable = [7, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday: weekday as TariffTable[number]['weekday'],
  rateMicrosPerHour: weekday <= 3 ? usd(1.5) : usd(2),
}));

describe('combos (REQ-001-80, REQ-001-81)', () => {
  it('CA-001-14: 20 USD por 20 h salen a 1,00 USD/h, un 33 % y un 50 % menos', () => {
    const rate = comboRatePerHour(usd(20), hours(20));
    expect(rate).toBe(usd(1));
    const discounts = comboDiscounts(rate, table);
    expect(discounts.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(discounts.map((d) => d.discountPercent)).toEqual([33, 33, 33, 50, 50, 50, 50]);
  });

  it('redondea el precio por hora al µUSD y admite combos más caros que la tarifa', () => {
    expect(comboRatePerHour(usd(1), 7200 + 1)).toBe(499_931);
    const [monday] = comboDiscounts(usd(3), table);
    expect(monday?.discountPercent).toBe(-100);
  });

  it('rechaza un combo sin tiempo', () => {
    expect(() => comboRatePerHour(usd(1), 0)).toThrow(RangeError);
  });

  it('valida el alta y exige algo que cambiar en la edición', () => {
    expect(
      comboCreateRequestSchema.safeParse({
        name: ' Combo 20 horas ',
        priceMicros: usd(20),
        seconds: hours(20),
      }).data?.name,
    ).toBe('Combo 20 horas');
    for (const body of [
      { name: '', priceMicros: usd(20), seconds: 3600 },
      { name: 'X', priceMicros: 0, seconds: 3600 },
      { name: 'X', priceMicros: usd(20), seconds: 0 },
      { name: 'X', priceMicros: usd(20), seconds: 1.5 },
    ]) {
      expect(comboCreateRequestSchema.safeParse(body).success).toBe(false);
    }
    expect(comboUpdateRequestSchema.safeParse({}).success).toBe(false);
    expect(comboUpdateRequestSchema.safeParse({ active: false }).success).toBe(true);
  });
});
