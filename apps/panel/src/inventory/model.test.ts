import { micros, type Product, type StockMovement } from '@pope/shared';
import { describe, expect, it } from 'vitest';

import {
  filterByName,
  formatQuantity,
  initials,
  movementDetail,
  movementLabel,
  parseCount,
  parseQuantity,
  productStatus,
} from './model.js';

const ID = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a0a';

function product(name: string, stock: number, lowStock = false, active = true): Product {
  return {
    id: ID,
    name,
    priceMicros: micros(1_500_000),
    minStock: 5,
    active,
    photoVersion: null,
    stock,
    lowStock,
  };
}

const MOVE: StockMovement = {
  id: ID,
  productId: ID,
  kind: 'waste',
  quantity: -1,
  reason: 'bolsa rota',
  saleId: null,
  actorName: 'Luis',
  createdAt: '2026-09-28T16:10:00.000Z',
};

describe('estado de un producto (REQ-005-13)', () => {
  it('desactivado, agotado, bajo mínimo o bien', () => {
    expect(productStatus(product('Pepito', 3, true, false))).toBe('inactive');
    expect(productStatus(product('Pringles', 0, true))).toBe('out');
    expect(productStatus(product('Pringles', -1, true))).toBe('out');
    expect(productStatus(product('Pepito', 3, true))).toBe('low');
    expect(productStatus(product('Doritos', 24))).toBe('ok');
  });
});

describe('buscador de Inventario', () => {
  const list = [product('Doritos 45 g', 24), product('Pepito', 3), product('Café con leche', 9)];

  it('busca sin mayúsculas ni tildes, y vacío muestra todo', () => {
    expect(filterByName(list, 'pep').map((p) => p.name)).toEqual(['Pepito']);
    expect(filterByName(list, 'CAFE').map((p) => p.name)).toEqual(['Café con leche']);
    expect(filterByName(list, '  ')).toHaveLength(3);
    expect(filterByName(list, 'zzz')).toEqual([]);
  });

  it('iniciales para los productos sin foto', () => {
    expect(initials('Doritos 45 g')).toBe('D4');
    expect(initials('pepito')).toBe('P');
  });
});

describe('cantidades de los movimientos (REQ-005-10, REQ-005-14)', () => {
  it('entradas y mermas: enteros positivos', () => {
    expect(parseQuantity('24')).toBe(24);
    for (const text of ['0', '-2', '2,5', 'abc', '', '1000000']) {
      expect(parseQuantity(text)).toBeNull();
    }
  });

  it('el mínimo y lo que llegó admiten 0 o nada', () => {
    expect(parseCount('')).toBeNull();
    expect(parseCount(' 0 ')).toBe(0);
    expect(parseCount('24')).toBe(24);
    expect(parseCount('-1')).toBeUndefined();
    expect(parseCount('2,5')).toBeUndefined();
    expect(parseCount('100001')).toBeUndefined();
  });

  it('un ajuste puede restar, pero no ser 0', () => {
    expect(parseQuantity('-2', true)).toBe(-2);
    expect(parseQuantity('+3', true)).toBe(3);
    expect(parseQuantity('0', true)).toBeNull();
  });

  it('cómo se lee cada movimiento', () => {
    expect(movementLabel(MOVE)).toBe('Merma');
    expect(movementLabel({ ...MOVE, kind: 'sale' })).toBe('Venta');
    expect(movementLabel({ ...MOVE, kind: 'sale', quantity: 2 })).toBe('Venta anulada');
    expect(movementLabel({ ...MOVE, kind: 'restock', quantity: 12 })).toBe('Entrada');
    expect(formatQuantity(12)).toBe('+12');
    expect(formatQuantity(-1)).toBe('−1');
    expect(movementDetail(MOVE)).toBe('28/9, 12:10 · Luis · bolsa rota');
    expect(movementDetail({ ...MOVE, reason: null })).toBe('28/9, 12:10 · Luis');
  });
});
