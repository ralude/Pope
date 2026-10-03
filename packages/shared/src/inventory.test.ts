import { describe, expect, it } from 'vitest';

import {
  isLowStock,
  MAX_STOCK_QUANTITY,
  productCreateRequestSchema,
  productPhotoPath,
  productUpdateRequestSchema,
  stockDelta,
  stockMoveRequestSchema,
} from './inventory.js';
import { usd } from './money.js';

const ID = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a0a';

describe('productos (REQ-005-01, REQ-005-04)', () => {
  const doritos = { name: ' Doritos ', priceMicros: usd(1.5), minStock: 5, initialQuantity: 24 };

  it('CA-005-08: alta con precio, mínimo y lo que llegó', () => {
    expect(productCreateRequestSchema.parse(doritos)).toEqual({
      ...doritos,
      name: 'Doritos',
      active: true,
    });
    expect(productCreateRequestSchema.safeParse({ ...doritos, minStock: null }).success).toBe(true);
    expect(productCreateRequestSchema.safeParse({ ...doritos, initialQuantity: 0 }).success).toBe(
      true,
    );
  });

  it('sale activo salvo que se diga lo contrario', () => {
    expect(productCreateRequestSchema.parse(doritos).active).toBe(true);
    expect(productCreateRequestSchema.parse({ ...doritos, active: false }).active).toBe(false);
  });

  it('rechaza nombre vacío, precio 0, cantidades negativas o con decimales', () => {
    const valid = (patch: object) =>
      productCreateRequestSchema.safeParse({ ...doritos, ...patch }).success;
    expect(valid({ name: '  ' })).toBe(false);
    expect(valid({ priceMicros: 0 })).toBe(false);
    expect(valid({ priceMicros: 1.5 })).toBe(false);
    expect(valid({ initialQuantity: -1 })).toBe(false);
    expect(valid({ initialQuantity: 2.5 })).toBe(false);
    expect(valid({ initialQuantity: MAX_STOCK_QUANTITY + 1 })).toBe(false);
    expect(valid({ minStock: -1 })).toBe(false);
  });

  it('la edición cambia lo que venga, pero nunca el stock (REQ-005-10)', () => {
    expect(productUpdateRequestSchema.safeParse({ active: false }).success).toBe(true);
    expect(productUpdateRequestSchema.safeParse({ priceMicros: usd(1.75) }).success).toBe(true);
    expect(productUpdateRequestSchema.safeParse({}).success).toBe(false);
    expect(productUpdateRequestSchema.parse({ stock: 50, active: true })).toEqual({ active: true });
  });
});

describe('aviso de stock bajo (REQ-005-13)', () => {
  it('avisa al llegar al mínimo o por debajo, y nunca sin mínimo', () => {
    expect(isLowStock(4, 5)).toBe(true);
    expect(isLowStock(5, 5)).toBe(true);
    expect(isLowStock(6, 5)).toBe(false);
    expect(isLowStock(0, null)).toBe(false);
    expect(isLowStock(-1, 0)).toBe(true);
  });
});

describe('foto del producto (REQ-005-03)', () => {
  it('la ruta lleva la versión para no ver una foto vieja', () => {
    expect(productPhotoPath({ id: ID, photoVersion: '3f2a9c' })).toBe(
      `/products/${ID}/photo?v=3f2a9c`,
    );
    expect(productPhotoPath({ id: ID, photoVersion: null })).toBeNull();
  });
});

describe('movimientos de stock (REQ-005-10, REQ-005-14)', () => {
  it('la entrada no pide motivo; ajuste y merma sí', () => {
    const valid = (body: object) => stockMoveRequestSchema.safeParse(body).success;
    expect(valid({ kind: 'restock', quantity: 24 })).toBe(true);
    expect(valid({ kind: 'waste', quantity: 1 })).toBe(false);
    expect(valid({ kind: 'waste', quantity: 1, reason: '  ' })).toBe(false);
    expect(valid({ kind: 'waste', quantity: 1, reason: 'Vencido' })).toBe(true);
    expect(valid({ kind: 'adjustment', quantity: -2, reason: 'Conteo' })).toBe(true);
  });

  it('las ventas no se registran por aquí', () => {
    expect(stockMoveRequestSchema.safeParse({ kind: 'sale', quantity: 1 }).success).toBe(false);
  });

  it('entradas y mermas son positivas; el ajuste lleva signo y no es 0', () => {
    const valid = (body: object) => stockMoveRequestSchema.safeParse(body).success;
    expect(valid({ kind: 'restock', quantity: 0 })).toBe(false);
    expect(valid({ kind: 'restock', quantity: -3 })).toBe(false);
    expect(valid({ kind: 'waste', quantity: -1, reason: 'Vencido' })).toBe(false);
    expect(valid({ kind: 'adjustment', quantity: 0, reason: 'Conteo' })).toBe(false);
  });

  it('el stock es la suma de los movimientos y la merma resta (REQ-005-11)', () => {
    const moves = [
      stockMoveRequestSchema.parse({ kind: 'restock', quantity: 10 }),
      stockMoveRequestSchema.parse({ kind: 'waste', quantity: 1, reason: 'Roto' }),
      stockMoveRequestSchema.parse({ kind: 'adjustment', quantity: -3, reason: 'Conteo' }),
    ];
    expect(moves.map(stockDelta)).toEqual([10, -1, -3]);
    expect(moves.reduce((stock, move) => stock + stockDelta(move), 0)).toBe(6);
  });
});
