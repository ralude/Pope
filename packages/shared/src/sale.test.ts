import { describe, expect, it } from 'vitest';

import { usd } from './money.js';
import {
  lineTotal,
  saleGroupTotals,
  saleLineGroup,
  saleRequestSchema,
  saleVoidRequestSchema,
} from './sale.js';

const id = (n: number) => `0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a${n.toString(16).padStart(2, '0')}`;

const DORITOS = { kind: 'product', productId: id(1), quantity: 2 };
const IMPRESIONES = { kind: 'concept', conceptId: id(2), quantity: 12, unitPriceMicros: usd(0.1) };
const CASH = { method: 'cash_usd', usdMicros: usd(4.2) };

describe('venta (REQ-005-20, REQ-005-21)', () => {
  const valid = (body: object) =>
    saleRequestSchema.safeParse({ lines: [DORITOS], payments: [CASH], customerId: null, ...body })
      .success;

  it('lleva productos y conceptos, y uno o varios pagos', () => {
    expect(valid({ lines: [DORITOS, IMPRESIONES] })).toBe(true);
    expect(
      valid({
        payments: [
          { method: 'cash_usd', usdMicros: usd(2) },
          { method: 'pos', usdMicros: usd(2.2) },
        ],
      }),
    ).toBe(true);
  });

  it('no puede ir vacía ni sin pago', () => {
    expect(valid({ lines: [] })).toBe(false);
    expect(valid({ payments: [] })).toBe(false);
  });

  it('cantidades enteras y positivas; el concepto lleva su precio por unidad', () => {
    expect(valid({ lines: [{ ...DORITOS, quantity: 0 }] })).toBe(false);
    expect(valid({ lines: [{ ...DORITOS, quantity: 1.5 }] })).toBe(false);
    expect(valid({ lines: [{ ...IMPRESIONES, unitPriceMicros: 0 }] })).toBe(false);
    expect(valid({ lines: [{ kind: 'concept', conceptId: id(2), quantity: 12 }] })).toBe(false);
  });

  it('cada método va una sola vez', () => {
    expect(valid({ payments: [CASH, CASH] })).toBe(false);
  });

  it('CA-005-10: el pago con saldo lleva la cuenta, y la cuenta solo va con él', () => {
    const balance = { method: 'balance', usdMicros: usd(1.5) };
    expect(valid({ payments: [balance], customerId: id(3) })).toBe(true);
    expect(valid({ payments: [balance], customerId: null })).toBe(false);
    expect(valid({ payments: [CASH], customerId: id(3) })).toBe(false);
  });

  it('no acepta métodos de fuera de la lista', () => {
    expect(valid({ payments: [{ method: 'zelle', usdMicros: usd(1) }] })).toBe(false);
  });
});

describe('importes y grupos de la venta (REQ-005-52)', () => {
  it('CA-005-07: 12 impresiones a 0,10 USD son 1,20 USD', () => {
    expect(lineTotal(12, usd(0.1))).toBe(usd(1.2));
  });

  it('productos a golosinas y conceptos a otras ventas', () => {
    expect(saleLineGroup('product')).toBe('snacks');
    expect(saleLineGroup('concept')).toBe('other');
  });

  it('suma por grupo en el orden de las líneas', () => {
    expect(
      saleGroupTotals([
        { kind: 'concept', totalMicros: usd(1.2) },
        { kind: 'product', totalMicros: usd(1.5) },
        { kind: 'product', totalMicros: usd(1.5) },
      ]),
    ).toEqual([
      { group: 'other', usdMicros: usd(1.2) },
      { group: 'snacks', usdMicros: usd(3) },
    ]);
  });
});

describe('anulación (REQ-005-23)', () => {
  it('pide motivo', () => {
    expect(saleVoidRequestSchema.safeParse({ reason: 'error de cobro' }).success).toBe(true);
    expect(saleVoidRequestSchema.safeParse({ reason: '  ' }).success).toBe(false);
  });
});
