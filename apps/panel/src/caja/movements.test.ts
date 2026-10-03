import { type CashMovement, micros, usd } from '@pope/shared';
import { describe, expect, it } from 'vitest';

import { movementRow } from './movements.js';

const SALE: CashMovement = {
  source: 'sale',
  sourceId: '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a0a',
  at: '2026-09-28T22:32:00.000Z',
  description: 'Impresiones × 12',
  usdMicros: usd(1.2),
  payments: [{ method: 'cash_usd', currency: 'USD', amountMicros: usd(1.2), vesRate: null }],
  actorName: 'Ana',
  voided: false,
  reason: null,
};

describe('lista de movimientos de la caja (REQ-005-24)', () => {
  it('CA-005-07: «Impresiones × 12 · 1,20 USD · Efectivo USD», con la hora y quién', () => {
    expect(movementRow(SALE, false)).toEqual({
      time: '18:32',
      what: 'Impresiones × 12',
      detail: 'Ana',
      methods: 'Efectivo USD',
      amount: '1,20 USD',
      amountBs: null,
      withBalance: false,
      voided: false,
      canVoid: false,
    });
  });

  it('lo cobrado en Bs se ve en Bs, y dos métodos se juntan', () => {
    const row = movementRow(
      {
        ...SALE,
        payments: [
          { method: 'cash_usd', currency: 'USD', amountMicros: usd(1), vesRate: null },
          {
            method: 'pos',
            currency: 'VES',
            amountMicros: micros(8_100_000),
            vesRate: null,
          },
        ],
      },
      false,
    );
    expect(row.methods).toBe('Efectivo USD + Punto de venta');
    expect(row.amountBs).toBe('8,10 Bs');
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
    expect(row).toMatchObject({ methods: 'Pago móvil', amountBs: null });
  });

  it('CA-005-10: con saldo se marca, y no es dinero de la caja', () => {
    const row = movementRow(
      {
        ...SALE,
        payments: [{ method: 'balance', currency: 'USD', amountMicros: usd(1.5), vesRate: null }],
      },
      false,
    );
    expect(row).toMatchObject({
      detail: 'Ana · con saldo',
      withBalance: true,
      methods: 'Con saldo',
    });
  });

  it('CA-005-11: solo el administrador anula, y una venta anulada no se anula otra vez', () => {
    expect(movementRow(SALE, true).canVoid).toBe(true);
    expect(movementRow({ ...SALE, voided: true }, true)).toMatchObject({
      what: 'Impresiones × 12 · anulada',
      canVoid: false,
    });
    const voidRow = movementRow(
      {
        ...SALE,
        source: 'void',
        description: 'Anulación · Impresiones × 12',
        usdMicros: usd(-1.2),
        actorName: 'Luis',
        reason: 'error de cobro',
      },
      true,
    );
    expect(voidRow).toMatchObject({
      detail: 'Luis · motivo: error de cobro',
      amount: '-1,20 USD',
      canVoid: false,
    });
  });
});
