import { describe, expect, it } from 'vitest';

import { cashTotals, methodCurrency, splitPayments, vesAmount } from './cash.js';
import { usd, vesRate } from './money.js';

const RATE_40 = vesRate(40_000_000);
// 36,5432 Bs por USD: obliga a redondear al céntimo.
const RATE_ODD = vesRate(36_543_200);

describe('moneda de cada método (REQ-005-21, REQ-005-22)', () => {
  it('efectivo USD y saldo en USD; efectivo Bs, pago móvil y punto en Bs', () => {
    expect(methodCurrency('cash_usd')).toBe('USD');
    expect(methodCurrency('balance')).toBe('USD');
    expect(methodCurrency('cash_ves')).toBe('VES');
    expect(methodCurrency('mobile_payment')).toBe('VES');
    expect(methodCurrency('pos')).toBe('VES');
  });
});

describe('importe en Bs (REQ-005-22)', () => {
  it('CA-005-02: 1,00 USD a 40 Bs son 40,00 Bs', () => {
    expect(vesAmount(usd(1), RATE_40)).toBe(40_000_000);
  });

  it('se redondea al céntimo', () => {
    // 1,50 × 36,5432 = 54,8148 → 54,81 Bs
    expect(vesAmount(usd(1.5), RATE_ODD)).toBe(54_810_000);
  });
});

describe('reparto de los pagos por grupo (plan 005: una fila por pago y grupo)', () => {
  it('CA-005-02: un refresco pagado en efectivo Bs guarda 40,00 Bs y la tasa 40', () => {
    expect(
      splitPayments(
        [{ group: 'snacks', usdMicros: usd(1) }],
        [{ method: 'cash_ves', usdMicros: usd(1) }],
        RATE_40,
      ),
    ).toEqual([
      {
        group: 'snacks',
        method: 'cash_ves',
        currency: 'VES',
        amountMicros: 40_000_000,
        usdMicros: usd(1),
        vesRate: RATE_40,
      },
    ]);
  });

  it('un pago que cubre golosinas e impresiones da una fila por grupo', () => {
    const pieces = splitPayments(
      [
        { group: 'snacks', usdMicros: usd(3) },
        { group: 'other', usdMicros: usd(1.2) },
      ],
      [{ method: 'cash_usd', usdMicros: usd(4.2) }],
      null,
    );
    expect(pieces.map((p) => [p.group, p.method, p.amountMicros, p.vesRate])).toEqual([
      ['snacks', 'cash_usd', usd(3), null],
      ['other', 'cash_usd', usd(1.2), null],
    ]);
  });

  it('dos pagos llenan los grupos en orden', () => {
    const pieces = splitPayments(
      [
        { group: 'snacks', usdMicros: usd(3) },
        { group: 'other', usdMicros: usd(1.2) },
      ],
      [
        { method: 'cash_usd', usdMicros: usd(2) },
        { method: 'pos', usdMicros: usd(2.2) },
      ],
      RATE_40,
    );
    expect(pieces.map((p) => [p.group, p.method, p.usdMicros, p.amountMicros])).toEqual([
      ['snacks', 'cash_usd', usd(2), usd(2)],
      ['snacks', 'pos', usd(1), 40_000_000],
      ['other', 'pos', usd(1.2), 48_000_000],
    ]);
  });

  it('las filas de un pago en Bs suman lo que pagó el cliente, sin perder un céntimo', () => {
    // 0,01 + 0,01 USD a 36,5432: cada mitad redondea a 0,37 Bs, pero el total es 0,73 Bs.
    const pieces = splitPayments(
      [
        { group: 'snacks', usdMicros: usd(0.01) },
        { group: 'other', usdMicros: usd(0.01) },
      ],
      [{ method: 'mobile_payment', usdMicros: usd(0.02) }],
      RATE_ODD,
    );
    expect(pieces.map((p) => p.amountMicros)).toEqual([370_000, 360_000]);
    expect(vesAmount(usd(0.02), RATE_ODD)).toBe(730_000);
  });

  it('sin tasa no se cobra en Bs (REQ-005-34)', () => {
    expect(() =>
      splitPayments(
        [{ group: 'pc', usdMicros: usd(1) }],
        [{ method: 'mobile_payment', usdMicros: usd(1) }],
        null,
      ),
    ).toThrow(RangeError);
  });

  it('los pagos tienen que sumar lo cobrado', () => {
    expect(() =>
      splitPayments(
        [{ group: 'snacks', usdMicros: usd(1.5) }],
        [{ method: 'cash_usd', usdMicros: usd(1) }],
        null,
      ),
    ).toThrow(RangeError);
  });
});

describe('totales por grupo (REQ-005-25, REQ-005-52)', () => {
  it('CA-005-09: temporales 10, recargas 5, golosinas 3 e impresiones 1,20 suman 19,20', () => {
    expect(
      cashTotals([
        { group: 'pc', method: 'cash_usd', usdMicros: usd(10) },
        { group: 'pc', method: 'mobile_payment', usdMicros: usd(5) },
        { group: 'snacks', method: 'cash_ves', usdMicros: usd(3) },
        { group: 'other', method: 'cash_usd', usdMicros: usd(1.2) },
      ]),
    ).toEqual({ pc: usd(15), snacks: usd(3), other: usd(1.2), total: usd(19.2), balance: 0 });
  });

  it('CA-005-10: lo pagado con saldo va aparte y no suma en la caja', () => {
    expect(
      cashTotals([
        { group: 'snacks', method: 'cash_usd', usdMicros: usd(3) },
        { group: 'snacks', method: 'balance', usdMicros: usd(1.5) },
      ]),
    ).toEqual({ pc: 0, snacks: usd(3), other: 0, total: usd(3), balance: usd(1.5) });
  });

  it('una anulación resta (CA-005-11)', () => {
    expect(
      cashTotals([
        { group: 'snacks', method: 'cash_usd', usdMicros: usd(2) },
        { group: 'snacks', method: 'cash_usd', usdMicros: usd(-2) },
      ]).total,
    ).toBe(0);
  });
});
