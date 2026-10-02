import { describe, expect, it } from 'vitest';

import {
  businessDaysOld,
  currentRate,
  exchangeRateSetRequestSchema,
  isAcceptableRate,
  isRateStale,
  localDateInCaracas,
  MAX_VES_PER_USD,
} from './exchange-rate.js';

describe('localDateInCaracas', () => {
  it('cambia de día a las 04:00 UTC (medianoche en Caracas)', () => {
    expect(localDateInCaracas(new Date('2026-10-06T03:59:59Z'))).toBe('2026-10-05');
    expect(localDateInCaracas(new Date('2026-10-06T04:00:00Z'))).toBe('2026-10-06');
  });
});

describe('currentRate (REQ-005-33, REQ-005-34)', () => {
  const monday = { effectiveDate: '2026-10-05', obtainedAt: '2026-10-05T14:00:00.000Z', id: 'lun' };
  const manual = { effectiveDate: '2026-10-06', obtainedAt: '2026-10-06T19:20:00.000Z', id: 'man' };
  const tomorrow = {
    effectiveDate: '2026-10-07',
    obtainedAt: '2026-10-06T20:30:00.000Z',
    id: 'bcv',
  };

  it('sin tasas no hay vigente', () => {
    expect(currentRate([], new Date('2026-10-06T20:00:00Z'))).toBeNull();
  });

  it('una tasa manual vale desde que se guarda', () => {
    expect(currentRate([monday, manual], new Date('2026-10-06T19:00:00Z'))?.id).toBe('lun');
    expect(currentRate([monday, manual], new Date('2026-10-06T19:21:00Z'))?.id).toBe('man');
  });

  it('una tasa con fecha valor de mañana no cuenta hasta mañana', () => {
    const rates = [monday, manual, tomorrow];
    expect(currentRate(rates, new Date('2026-10-06T23:00:00Z'))?.id).toBe('man');
    expect(currentRate(rates, new Date('2026-10-07T04:00:00Z'))?.id).toBe('bcv');
  });
});

describe('antigüedad en días hábiles (REQ-005-35)', () => {
  it('cuenta de lunes a viernes, sin la fecha valor', () => {
    expect(businessDaysOld('2026-10-05', '2026-10-05')).toBe(0); // lunes, lunes
    expect(businessDaysOld('2026-10-05', '2026-10-06')).toBe(1); // martes
    expect(businessDaysOld('2026-10-05', '2026-10-07')).toBe(2); // miércoles
  });

  it('el fin de semana no cuenta', () => {
    expect(businessDaysOld('2026-10-09', '2026-10-12')).toBe(1); // viernes → lunes
    expect(businessDaysOld('2026-10-09', '2026-10-13')).toBe(2); // viernes → martes
  });

  it('CA-005-05: la tasa del lunes está desactualizada el miércoles', () => {
    const lunes = { effectiveDate: '2026-10-05' };
    expect(isRateStale(lunes, new Date('2026-10-06T15:00:00Z'))).toBe(false);
    expect(isRateStale(lunes, new Date('2026-10-07T15:00:00Z'))).toBe(true);
  });

  it('la del viernes sigue al día el lunes', () => {
    expect(isRateStale({ effectiveDate: '2026-10-09' }, new Date('2026-10-12T15:00:00Z'))).toBe(
      false,
    );
  });
});

describe('tasa manual que se puede guardar (REQ-005-34)', () => {
  it('acepta una tasa normal y rechaza cero, negativos, decimales y el exceso', () => {
    expect(exchangeRateSetRequestSchema.safeParse({ vesPerUsd: 40_000_000 }).success).toBe(true);
    expect(isAcceptableRate(MAX_VES_PER_USD)).toBe(true);
    expect(isAcceptableRate(MAX_VES_PER_USD + 1)).toBe(false);
    expect(isAcceptableRate(0)).toBe(false);
    expect(isAcceptableRate(-1)).toBe(false);
    expect(isAcceptableRate(40.5)).toBe(false);
  });

  it('no admite campos de más', () => {
    expect(
      exchangeRateSetRequestSchema.safeParse({ vesPerUsd: 40_000_000, source: 'bcv' }).success,
    ).toBe(false);
  });
});
