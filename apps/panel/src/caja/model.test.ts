import { type Product, type SaleConcept, usd } from '@pope/shared';
import { describe, expect, it } from 'vitest';

import {
  addConcept,
  addProduct,
  availability,
  cartTotal,
  changeQuantity,
  quantityInCart,
  saleLines,
} from './model.js';

const id = (n: number) => `0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a${n.toString(16).padStart(2, '0')}`;

const DORITOS: Product = {
  id: id(1),
  name: 'Doritos 45 g',
  priceMicros: usd(1.5),
  minStock: 5,
  active: true,
  photoVersion: null,
  stock: 24,
  lowStock: false,
};
const IMPRESIONES: SaleConcept = {
  id: id(2),
  name: 'Impresiones',
  unitPriceMicros: usd(0.1),
  active: true,
};

describe('carrito de la venta nueva (REQ-005-20)', () => {
  it('suma las golosinas iguales en una línea', () => {
    const cart = addProduct(addProduct([], DORITOS), DORITOS);
    expect(cart).toHaveLength(1);
    expect(cart[0]?.quantity).toBe(2);
    expect(cartTotal(cart)).toBe(usd(3));
  });

  it('CA-005-07: 12 impresiones a 0,10 USD son 1,20 USD; a otro precio, otra línea', () => {
    let cart = addConcept([], IMPRESIONES, 12, usd(0.1));
    expect(cartTotal(cart)).toBe(usd(1.2));
    cart = addConcept(cart, IMPRESIONES, 3, usd(0.1));
    expect(cart[0]?.quantity).toBe(15);
    cart = addConcept(cart, IMPRESIONES, 2, usd(0.15));
    expect(cart).toHaveLength(2);
  });

  it('− y + cambian la cantidad; a 0 la línea se quita', () => {
    let cart = addProduct([], DORITOS);
    cart = changeQuantity(cart, 0, 1);
    expect(cart[0]?.quantity).toBe(2);
    cart = changeQuantity(changeQuantity(cart, 0, -1), 0, -1);
    expect(cart).toEqual([]);
  });

  it('las líneas van al nodo como las pide POST /sales', () => {
    const cart = addConcept(addProduct([], DORITOS), IMPRESIONES, 12, usd(0.1));
    expect(saleLines(cart)).toEqual([
      { kind: 'product', productId: DORITOS.id, quantity: 1 },
      { kind: 'concept', conceptId: IMPRESIONES.id, quantity: 12, unitPriceMicros: usd(0.1) },
    ]);
  });

  it('los disponibles descuentan lo que ya va en el carrito', () => {
    const cart = addProduct(addProduct([], DORITOS), DORITOS);
    expect(quantityInCart(cart, DORITOS.id)).toBe(2);
    expect(availability(DORITOS, 2)).toEqual({ text: '22 disponibles', tone: 'ok' });
    expect(availability({ ...DORITOS, stock: 5, lowStock: true }, 0)).toEqual({
      text: 'Quedan 5 · bajo mínimo',
      tone: 'low',
    });
    expect(availability({ ...DORITOS, stock: 2 }, 2)).toEqual({ text: 'Agotado', tone: 'out' });
  });
});
