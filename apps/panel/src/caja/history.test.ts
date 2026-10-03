import { micros, type ShiftSummary, usd } from '@pope/shared';
import { describe, expect, it } from 'vitest';

import { historyRow } from './history.js';

const zero = micros(0);
const SUMMARY: ShiftSummary = {
  id: '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a0a',
  staffName: 'Ana',
  openedAt: '2026-10-02T12:02:00.000Z',
  closedAt: '2026-10-03T02:05:00.000Z',
  opening: { cashUsdMicros: usd(20), cashVesMicros: zero },
  totals: { pc: usd(27), snacks: usd(4), other: usd(2), total: usd(33), balance: zero },
  expected: { cash_usd: usd(27), cash_ves: zero, mobile_payment: zero, pos: zero },
  counted: { cash_usd: usd(27), cash_ves: zero, mobile_payment: zero, pos: zero },
  difference: { cash_usd: zero, cash_ves: zero, mobile_payment: zero, pos: zero },
};

describe('historial de cierres (REQ-005-53)', () => {
  it('el día, las horas en Caracas, quién y los totales', () => {
    expect(historyRow(SUMMARY)).toEqual({
      day: 'Viernes, 2 oct.',
      hours: '08:02 – 22:05',
      staff: 'Ana',
      pc: '27,00 USD',
      snacks: '4,00 USD',
      other: '2,00 USD',
      total: '33,00 USD',
      difference: 'Cuadra',
      tone: 'ok',
    });
  });

  it('las diferencias van en su moneda, sin sumar USD y Bs', () => {
    const row = historyRow({
      ...SUMMARY,
      difference: { cash_usd: usd(-2), cash_ves: zero, mobile_payment: zero, pos: usd(10) },
    });
    expect(row).toMatchObject({ difference: '-2,00 USD · +10,00 Bs', tone: 'short' });
    expect(
      historyRow({
        ...SUMMARY,
        difference: { cash_usd: zero, cash_ves: zero, mobile_payment: zero, pos: usd(10) },
      }).tone,
    ).toBe('over');
  });

  it('una caja cerrada antes de que se contara al cerrar sale «Sin conteo»', () => {
    expect(
      historyRow({ ...SUMMARY, expected: null, counted: null, difference: null }),
    ).toMatchObject({ hours: '08:02 – 22:05', difference: 'Sin conteo', tone: 'open' });
  });

  it('la caja en curso sale abierta', () => {
    expect(
      historyRow({ ...SUMMARY, closedAt: null, expected: null, counted: null, difference: null }),
    ).toMatchObject({ hours: '08:02 – abierta', difference: 'Abierta', tone: 'open' });
  });
});
