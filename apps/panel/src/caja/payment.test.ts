import { usd, vesRate } from '@pope/shared';
import { describe, expect, it } from 'vitest';

import { buildPayments, needsAccount, needsRate, vesCharges } from './payment.js';

describe('cobro de la venta (REQ-005-20 a REQ-005-22)', () => {
  it('con un método, se cobra todo con él', () => {
    expect(buildPayments(usd(5), { method: 'cash_usd', split: null })).toEqual({
      payments: [{ method: 'cash_usd', usdMicros: usd(5) }],
    });
  });

  it('«Dividir pago»: el segundo lleva su importe y el primero el resto', () => {
    expect(
      buildPayments(usd(5), { method: 'pos', split: { method: 'cash_usd', text: '2' } }),
    ).toEqual({
      payments: [
        { method: 'pos', usdMicros: usd(3) },
        { method: 'cash_usd', usdMicros: usd(2) },
      ],
    });
  });

  it('el segundo pago debe valer, ser menor que el total y con otro método', () => {
    const split = (method: 'cash_usd' | 'pos', text: string) =>
      buildPayments(usd(5), { method: 'pos', split: { method, text } });
    expect(split('cash_usd', '')).toEqual({ error: 'Escribe el importe del segundo pago.' });
    expect(split('cash_usd', '5')).toEqual({
      error: 'El segundo pago debe ser menor que el total.',
    });
    expect(split('pos', '2')).toEqual({ error: 'El segundo pago va con otro método.' });
    expect(buildPayments(usd(0), { method: 'cash_usd', split: null })).toEqual({
      error: 'La venta está vacía.',
    });
  });

  it('CA-005-02: 1,00 USD en efectivo Bs a 40 son 40,00 Bs', () => {
    const payments = [
      { method: 'cash_ves' as const, usdMicros: usd(1) },
      { method: 'cash_usd' as const, usdMicros: usd(2) },
    ];
    expect(vesCharges(payments, vesRate(40_000_000))).toEqual([
      { method: 'cash_ves', ves: 40_000_000 },
    ]);
    expect(needsRate(payments)).toBe(true);
    expect(needsRate([{ method: 'cash_usd', usdMicros: usd(1) }])).toBe(false);
  });

  it('CA-005-10: pagar con saldo pide la cuenta', () => {
    expect(needsAccount([{ method: 'balance', usdMicros: usd(1.5) }])).toBe(true);
    expect(needsAccount([{ method: 'pos', usdMicros: usd(1.5) }])).toBe(false);
  });
});
