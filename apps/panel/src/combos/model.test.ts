import { hours, tariffTableSchema, usd } from '@pope/shared';
import { describe, expect, it } from 'vitest';

import { comboPreview, discountRuns, formatHoursInput, parseHours, runDays } from './model.js';

const table = (rates: number[]) =>
  tariffTableSchema.parse(
    rates.map((rate, index) => ({ weekday: index + 1, rateMicrosPerHour: usd(rate) })),
  );

describe('horas del combo', () => {
  it('lee las horas con coma o con punto', () => {
    expect(parseHours('20')).toBe(hours(20));
    expect(parseHours('1,5')).toBe(5400);
    expect(parseHours('0.25')).toBe(900);
  });

  it('rechaza lo que no da tiempo', () => {
    for (const text of ['', '0', '0,00', '-2', 'diez', '1,234']) {
      expect(parseHours(text), text).toBeNull();
    }
  });

  it('escribe las horas para el campo de texto', () => {
    expect(formatHoursInput(hours(20))).toBe('20');
    expect(formatHoursInput(5400)).toBe('1,5');
  });
});

describe('descuento por tramos de días (REQ-001-80)', () => {
  it('CA-001-14: 20 USD por 20 h frente a lunes–miércoles 1,50 y jueves–domingo 2,00', () => {
    const preview = comboPreview(usd(20), hours(20), table([1.5, 1.5, 1.5, 2, 2, 2, 2]));
    expect(preview.rate).toBe(usd(1));
    expect(preview.lines).toEqual([
      '33 % menos que de lunes a miércoles (1,50 USD/h)',
      '50 % menos que de jueves a domingo (2,00 USD/h)',
    ]);
  });

  it('agrupa solo los días seguidos con el mismo precio', () => {
    const runs = discountRuns(usd(1), table([1.5, 2, 1.5, 1.5, 2, 2, 3]));
    expect(runs.map(runDays)).toEqual([
      'el lunes',
      'el martes',
      'miércoles y jueves',
      'viernes y sábado',
      'el domingo',
    ]);
  });

  it('dice cuándo el combo sale más caro o igual', () => {
    expect(comboPreview(usd(4), hours(2), table([1.5, 1.5, 1.5, 2, 2, 2, 2])).lines).toEqual([
      '33 % más que de lunes a miércoles (1,50 USD/h)',
      'Lo mismo que de jueves a domingo (2,00 USD/h)',
    ]);
  });
});
