import { describe, expect, it } from 'vitest';

import { usd } from './money.js';
import { rateFor, type TariffTable, tariffTableSchema, weekdayInCaracas } from './tariff.js';

// Tabla inicial de REQ-001-10: lunes a miércoles 1,50 USD/h y jueves a domingo 2,00 USD/h.
const table: TariffTable = tariffTableSchema.parse([
  { weekday: 1, rateMicrosPerHour: usd(1.5) },
  { weekday: 2, rateMicrosPerHour: usd(1.5) },
  { weekday: 3, rateMicrosPerHour: usd(1.5) },
  { weekday: 4, rateMicrosPerHour: usd(2) },
  { weekday: 5, rateMicrosPerHour: usd(2) },
  { weekday: 6, rateMicrosPerHour: usd(2) },
  { weekday: 7, rateMicrosPerHour: usd(2) },
]);

describe('weekdayInCaracas (REQ-001-10)', () => {
  it('usa ISO 8601: 1 = lunes … 7 = domingo', () => {
    expect(weekdayInCaracas(new Date('2026-09-28T16:00:00Z'))).toBe(1); // lunes
    expect(weekdayInCaracas(new Date('2026-09-23T16:00:00Z'))).toBe(3); // miércoles
    expect(weekdayInCaracas(new Date('2026-09-27T16:00:00Z'))).toBe(7); // domingo
  });

  it('cambia de día a las 00:00 de Caracas, que son las 04:00 UTC', () => {
    // Miércoles 23:59:59 en Caracas es ya jueves en UTC.
    expect(weekdayInCaracas(new Date('2026-09-24T03:59:59Z'))).toBe(3);
    expect(weekdayInCaracas(new Date('2026-09-24T04:00:00Z'))).toBe(4);
  });

  it('del domingo pasa al lunes', () => {
    expect(weekdayInCaracas(new Date('2026-09-28T03:59:59Z'))).toBe(7);
    expect(weekdayInCaracas(new Date('2026-09-28T04:00:00Z'))).toBe(1);
  });

  it('rechaza fechas no válidas', () => {
    expect(() => weekdayInCaracas(new Date('no es una fecha'))).toThrow(RangeError);
  });
});

describe('rateFor (REQ-001-10, REQ-001-14)', () => {
  it('de miércoles a jueves pasa de 1,50 a 2,00 USD/h a la medianoche de Caracas', () => {
    expect(rateFor(table, new Date('2026-09-24T03:59:59Z'))).toBe(usd(1.5));
    expect(rateFor(table, new Date('2026-09-24T04:00:00Z'))).toBe(usd(2));
  });

  it('CA-001-19: una sesión que empieza el miércoles a las 23:00 copia 1,50 USD/h', () => {
    // 23:00 del miércoles en Caracas = 03:00 UTC del jueves.
    expect(rateFor(table, new Date('2026-09-24T03:00:00Z'))).toBe(usd(1.5));
  });
});

describe('tariffTableSchema (REQ-001-10)', () => {
  const week = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, rateMicrosPerHour: 1_500_000 }));

  it('acepta una tabla de 7 días', () => {
    expect(tariffTableSchema.safeParse(week).success).toBe(true);
  });

  it('rechaza días de más, de menos o repetidos', () => {
    expect(tariffTableSchema.safeParse(week.slice(0, 6)).success).toBe(false);
    expect(tariffTableSchema.safeParse([...week.slice(0, 6), week[0]]).success).toBe(false);
  });

  it('rechaza días fuera de 1–7 y tarifas no enteras o no positivas', () => {
    const withDay = (weekday: number) => [...week.slice(0, 6), { weekday, rateMicrosPerHour: 1 }];
    expect(tariffTableSchema.safeParse(withDay(0)).success).toBe(false);
    expect(tariffTableSchema.safeParse(withDay(8)).success).toBe(false);
    const withRate = (rate: number) => [
      ...week.slice(0, 6),
      { weekday: 7, rateMicrosPerHour: rate },
    ];
    expect(tariffTableSchema.safeParse(withRate(0)).success).toBe(false);
    expect(tariffTableSchema.safeParse(withRate(-1)).success).toBe(false);
    expect(tariffTableSchema.safeParse(withRate(1.5)).success).toBe(false);
  });
});
