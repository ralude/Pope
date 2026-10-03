import { type CashMovement, micros, usd, vesRate } from '@pope/shared';
import { describe, expect, it } from 'vitest';

import { movementRow, openingRow, signedMoney } from './movements.js';

const SALE: CashMovement = {
  source: 'sale',
  sourceId: '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a0a',
  at: '2026-09-28T22:32:00.000Z',
  description: 'Otro ingreso · 12 impresiones',
  customerName: null,
  lines: [
    { kind: 'other', name: 'Otro ingreso · 12 impresiones', quantity: 1, usdMicros: usd(1.2) },
  ],
  usdMicros: usd(1.2),
  payments: [{ method: 'cash_usd', currency: 'USD', amountMicros: usd(1.2), vesRate: null }],
  actorName: 'Ana',
  voided: false,
  reason: null,
};

describe('tabla de movimientos de la caja (REQ-005-24)', () => {
  it('CA-005-07: «Cobrado · Otro ingreso · 12 impresiones · Efectivo USD · +1,20 USD», con la hora y quién', () => {
    expect(movementRow(SALE, false)).toEqual({
      time: '18:32',
      customer: '—',
      state: 'Cobrado',
      description: 'Otro ingreso · 12 impresiones',
      methods: 'Efectivo USD',
      total: '+1,20 USD',
      totalBs: null,
      negative: false,
      voided: false,
      canVoid: false,
      details: ['Otro ingreso · 12 impresiones · 1,20 USD', 'Efectivo USD 1,20 USD', 'Cobró Ana'],
    });
  });

  it('lo cobrado en Bs se ve en Bs, con la tasa en el detalle; dos métodos se juntan', () => {
    const row = movementRow(
      {
        ...SALE,
        description: 'Doritos 45 g × 2, Coca-Cola × 1',
        lines: [
          { kind: 'product', name: 'Doritos 45 g', quantity: 2, usdMicros: usd(3) },
          { kind: 'product', name: 'Coca-Cola', quantity: 1, usdMicros: usd(1) },
        ],
        usdMicros: usd(4),
        payments: [
          { method: 'cash_usd', currency: 'USD', amountMicros: usd(1), vesRate: null },
          {
            method: 'mobile_payment',
            currency: 'VES',
            amountMicros: micros(120_000_000),
            vesRate: vesRate(40_000_000),
          },
        ],
      },
      false,
    );
    expect(row).toMatchObject({
      methods: 'Efectivo USD + Pago móvil',
      total: '+4,00 USD',
      totalBs: '120,00 Bs',
    });
    expect(row.details).toEqual([
      'Doritos 45 g × 2 · 3,00 USD',
      'Coca-Cola × 1 · 1,00 USD',
      'Efectivo USD 1,00 USD + Pago móvil 120,00 Bs a 40,00 Bs por USD',
      'Cobró Ana',
    ]);
  });

  it('un cobro antiguo en un método de Bs, guardado en USD, no se muestra en Bs', () => {
    const row = movementRow(
      {
        ...SALE,
        payments: [
          { method: 'mobile_payment', currency: 'USD', amountMicros: usd(0.83), vesRate: null },
        ],
      },
      false,
    );
    expect(row).toMatchObject({ methods: 'Pago móvil', totalBs: null });
  });

  it('CA-005-10 y CA-005-12: lo pagado con saldo va «Con saldo», con la cuenta', () => {
    const row = movementRow(
      {
        ...SALE,
        customerName: 'juan',
        payments: [{ method: 'balance', currency: 'USD', amountMicros: usd(1.5), vesRate: null }],
      },
      false,
    );
    expect(row).toMatchObject({ customer: 'juan', state: 'Con saldo', methods: 'Con saldo' });
    expect(row.details).toContain('Pagado con el saldo de juan: no entra en la caja');
  });

  it('CA-005-11 y CA-005-12: la venta anulada queda «Anulada» y su anulación resta, con el motivo', () => {
    expect(movementRow(SALE, true).canVoid).toBe(true);
    expect(movementRow({ ...SALE, voided: true }, true)).toMatchObject({
      state: 'Anulada',
      voided: true,
      total: '+1,20 USD',
      canVoid: false,
    });
    const voidRow = movementRow(
      {
        ...SALE,
        source: 'void',
        description: 'Anulación · Otro ingreso · 12 impresiones',
        usdMicros: usd(-1.2),
        payments: [{ method: 'cash_usd', currency: 'USD', amountMicros: usd(-1.2), vesRate: null }],
        actorName: 'Luis',
        reason: 'error de cobro',
      },
      true,
    );
    expect(voidRow).toMatchObject({
      state: 'Anulación',
      total: '−1,20 USD',
      negative: true,
      canVoid: false,
    });
    expect(voidRow.details.at(-1)).toBe('Anuló Luis · motivo: error de cobro');
    expect(voidRow.details).toContain('Efectivo USD 1,20 USD');
  });

  it('CA-005-12: la apertura, al final, con su hora y el fondo', () => {
    expect(
      openingRow('2026-09-28T12:02:00.000Z', 'Ana', {
        cashUsdMicros: usd(20),
        cashVesMicros: micros(500_000_000),
      }),
    ).toMatchObject({
      time: '08:02',
      state: 'Apertura',
      description: 'Apertura de caja · fondo 20,00 USD y 500,00 Bs',
      total: '—',
      details: ['Abrió Ana con 20,00 USD y 500,00 Bs en efectivo'],
    });
  });

  it('el signo va siempre delante, como en SENET', () => {
    expect(signedMoney(usd(4))).toBe('+4,00 USD');
    expect(signedMoney(usd(-2))).toBe('−2,00 USD');
    expect(signedMoney(usd(0))).toBe('+0,00 USD');
  });
});
