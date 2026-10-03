import { micros, type ShiftClosing, usd } from '@pope/shared';
import { describe, expect, it } from 'vitest';

import { closingRows, difference, differencesSummary, differenceText } from './closing.js';

const bs = (amount: number) => usd(amount); // mismas µ-unidades, en VES

const CLOSING: ShiftClosing = {
  shiftId: '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a0a',
  openedAt: '2026-10-02T12:02:00.000Z',
  opening: { cashUsdMicros: usd(20), cashVesMicros: bs(500) },
  expected: { cash_usd: usd(50), cash_ves: bs(580), mobile_payment: bs(160), pos: micros(0) },
  totals: {
    pc: usd(27),
    snacks: usd(4),
    other: usd(2),
    total: usd(33),
    balance: usd(1.5),
  },
};

describe('cierre de la caja (REQ-005-42)', () => {
  const rows = closingRows(CLOSING);

  it('lo esperado por método, en su moneda, con el fondo en el efectivo', () => {
    expect(rows.map((r) => [r.label, r.hint, r.currency])).toEqual([
      ['Efectivo USD', 'Fondo 20,00 USD + cobrado 30,00 USD', 'USD'],
      ['Efectivo Bs', 'Fondo 500,00 Bs + cobrado 80,00 Bs', 'VES'],
      ['Pago móvil', 'Cobrado', 'VES'],
      ['Punto de venta', 'Cobrado', 'VES'],
    ]);
  });

  it('CA-005-03: con 50 USD esperados y 45 contados, la diferencia es −5 USD', () => {
    const [cashUsd] = rows;
    if (!cashUsd) throw new Error('falta el efectivo USD');
    const diff = difference(cashUsd, '45');
    expect(diff).toBe(usd(-5));
    expect(differenceText(cashUsd, diff)).toEqual({ text: '-5,00 USD', tone: 'short' });
    expect(differenceText(cashUsd, difference(cashUsd, '50,00'))).toEqual({
      text: '0,00 USD',
      tone: 'ok',
    });
    expect(differenceText(cashUsd, difference(cashUsd, '52'))).toEqual({
      text: '+2,00 USD',
      tone: 'over',
    });
    expect(differenceText(cashUsd, difference(cashUsd, ''))).toEqual({ text: '—', tone: 'none' });
  });

  it('resume lo que no cuadra para la confirmación', () => {
    expect(
      differencesSummary(rows, {
        cash_usd: '45',
        cash_ves: '580',
        mobile_payment: '160',
        pos: '10',
      }),
    ).toBe('Efectivo USD -5,00 USD · Punto de venta +10,00 Bs');
    expect(
      differencesSummary(rows, {
        cash_usd: '50',
        cash_ves: '580',
        mobile_payment: '160',
        pos: '0',
      }),
    ).toBe('');
  });
});
