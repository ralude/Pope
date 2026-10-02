import { describe, expect, it } from 'vitest';

import { usd } from './money.js';
import {
  cashDifference,
  expectedCash,
  openingCashSchema,
  shiftCloseRequestSchema,
} from './shift.js';

const bs = (amount: number) => usd(amount); // mismas µ-unidades, en VES
const OPENING = { cashUsdMicros: usd(20), cashVesMicros: bs(500) };

describe('fondo inicial (REQ-005-40)', () => {
  it('en efectivo USD y Bs, sin negativos', () => {
    expect(openingCashSchema.safeParse(OPENING).success).toBe(true);
    expect(openingCashSchema.safeParse({ cashUsdMicros: 0, cashVesMicros: 0 }).success).toBe(true);
    expect(openingCashSchema.safeParse({ ...OPENING, cashUsdMicros: -1 }).success).toBe(false);
    expect(openingCashSchema.safeParse({ cashUsdMicros: usd(20) }).success).toBe(false);
  });
});

describe('lo esperado al cerrar (REQ-005-42)', () => {
  it('fondo más lo cobrado en cada método, en su moneda', () => {
    expect(
      expectedCash(OPENING, [
        { method: 'cash_usd', currency: 'USD', amountMicros: usd(5) },
        { method: 'cash_usd', currency: 'USD', amountMicros: usd(2) },
        { method: 'cash_ves', currency: 'VES', amountMicros: bs(80) },
        { method: 'mobile_payment', currency: 'VES', amountMicros: bs(160) },
        { method: 'pos', currency: 'VES', amountMicros: bs(800) },
      ]),
    ).toEqual({ cash_usd: usd(27), cash_ves: bs(580), mobile_payment: bs(160), pos: bs(800) });
  });

  it('lo pagado con saldo no está en la caja (REQ-005-25)', () => {
    expect(
      expectedCash(OPENING, [{ method: 'balance', currency: 'USD', amountMicros: usd(1.5) }]),
    ).toEqual({ cash_usd: usd(20), cash_ves: bs(500), mobile_payment: 0, pos: 0 });
  });

  it('una anulación resta de su método (CA-005-11)', () => {
    expect(
      expectedCash(OPENING, [
        { method: 'cash_usd', currency: 'USD', amountMicros: usd(2) },
        { method: 'cash_usd', currency: 'USD', amountMicros: usd(-2) },
      ]).cash_usd,
    ).toBe(usd(20));
  });

  it('los cobros de antes en un método de Bs, guardados en USD, no se cuentan en Bs', () => {
    expect(
      expectedCash(OPENING, [{ method: 'mobile_payment', currency: 'USD', amountMicros: usd(3) }])
        .mobile_payment,
    ).toBe(0);
  });
});

describe('diferencia (REQ-005-42)', () => {
  it('CA-005-03: con 50 USD esperados y 45 contados, faltan 5', () => {
    const expected = { cash_usd: usd(50), cash_ves: bs(500), mobile_payment: usd(0), pos: usd(0) };
    const counted = { cash_usd: usd(45), cash_ves: bs(500), mobile_payment: usd(0), pos: bs(10) };
    expect(cashDifference(expected, counted)).toEqual({
      cash_usd: usd(-5),
      cash_ves: 0,
      mobile_payment: 0,
      pos: bs(10),
    });
  });

  it('lo contado lleva los cuatro métodos y ninguno negativo', () => {
    const counted = { cash_usd: usd(45), cash_ves: bs(500), mobile_payment: 0, pos: 0 };
    expect(shiftCloseRequestSchema.safeParse({ counted }).success).toBe(true);
    expect(
      shiftCloseRequestSchema.safeParse({ counted: { ...counted, pos: undefined } }).success,
    ).toBe(false);
    expect(shiftCloseRequestSchema.safeParse({ counted: { ...counted, pos: -1 } }).success).toBe(
      false,
    );
    expect(shiftCloseRequestSchema.safeParse({ counted: { ...counted, balance: 0 } }).success).toBe(
      false,
    );
  });
});
