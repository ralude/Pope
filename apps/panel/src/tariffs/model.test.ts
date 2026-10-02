import { tariffTableSchema, usd, type Weekday } from '@pope/shared';
import { describe, expect, it } from 'vitest';

import { rateByWeekday, selectionText, sortedWeekdays, weekdayTitle } from './model.js';

describe('tabla de tarifas (REQ-001-10, REQ-001-15)', () => {
  it('pone el nombre de cada día con mayúscula', () => {
    expect(weekdayTitle(1)).toBe('Lunes');
    expect(weekdayTitle(3)).toBe('Miércoles');
    expect(weekdayTitle(7)).toBe('Domingo');
  });

  it('da el precio de cada día aunque la tabla llegue desordenada', () => {
    const table = tariffTableSchema.parse(
      ([7, 1, 2, 3, 4, 5, 6] as const).map((weekday) => ({
        weekday,
        rateMicrosPerHour: weekday <= 3 ? usd(1.5) : usd(2),
      })),
    );
    const rates = rateByWeekday(table);
    expect(rates.get(1)).toBe(usd(1.5));
    expect(rates.get(7)).toBe(usd(2));
  });

  it('resume la selección y la ordena de lunes a domingo', () => {
    expect(selectionText(new Set())).toBe('Elige al menos un día');
    expect(selectionText(new Set<Weekday>([5]))).toBe('1 día seleccionado');
    const selected = new Set<Weekday>([4, 1, 3, 2]);
    expect(selectionText(selected)).toBe('4 días seleccionados');
    expect(sortedWeekdays(selected)).toEqual([1, 2, 3, 4]);
  });
});
