// La venta nueva de la Caja (spec 005, REQ-005-20): el carrito con golosinas y conceptos, y
// su total. Todo en µUSD enteros (ADR-0015).
import {
  lineTotal,
  type Micros,
  micros,
  type Product,
  type SaleConcept,
  type SaleLineRequest,
} from '@pope/shared';

/** Una línea del carrito. Un concepto lleva el precio por unidad que dijo el encargado. */
export type CartLine =
  | { kind: 'product'; productId: string; name: string; unitPriceMicros: Micros; quantity: number }
  | { kind: 'concept'; conceptId: string; name: string; unitPriceMicros: Micros; quantity: number };

function sameItem(line: CartLine, other: CartLine): boolean {
  if (line.kind === 'product' && other.kind === 'product') {
    return line.productId === other.productId;
  }
  if (line.kind === 'concept' && other.kind === 'concept') {
    // El mismo concepto a otro precio es otra línea: así se ve qué se cobró a cada precio.
    return line.conceptId === other.conceptId && line.unitPriceMicros === other.unitPriceMicros;
  }
  return false;
}

/** Añade una línea, o suma su cantidad a la que ya hay del mismo artículo. */
function add(cart: readonly CartLine[], line: CartLine): CartLine[] {
  const index = cart.findIndex((existing) => sameItem(existing, line));
  if (index < 0) return [...cart, line];
  return cart.map((existing, i) =>
    i === index ? { ...existing, quantity: existing.quantity + line.quantity } : existing,
  );
}

/** Una golosina más: con el precio del producto, que es el que cobra el nodo. */
export function addProduct(cart: readonly CartLine[], product: Product): CartLine[] {
  return add(cart, {
    kind: 'product',
    productId: product.id,
    name: product.name,
    unitPriceMicros: product.priceMicros,
    quantity: 1,
  });
}

/** Un concepto con la cantidad y el precio por unidad que escribió el encargado (REQ-005-05). */
export function addConcept(
  cart: readonly CartLine[],
  concept: SaleConcept,
  quantity: number,
  unitPriceMicros: Micros,
): CartLine[] {
  return add(cart, {
    kind: 'concept',
    conceptId: concept.id,
    name: concept.name,
    unitPriceMicros,
    quantity,
  });
}

/** Suma o resta uno a una línea; a 0 desaparece. */
export function changeQuantity(
  cart: readonly CartLine[],
  index: number,
  delta: number,
): CartLine[] {
  return cart.flatMap((line, i) => {
    if (i !== index) return [line];
    const quantity = line.quantity + delta;
    return quantity > 0 ? [{ ...line, quantity }] : [];
  });
}

export function cartLineTotal(line: CartLine): Micros {
  return lineTotal(line.quantity, line.unitPriceMicros);
}

export function cartTotal(cart: readonly CartLine[]): Micros {
  return micros(cart.reduce((sum, line) => sum + cartLineTotal(line), 0));
}

/** Cuántas unidades de un producto lleva ya el carrito (para los disponibles del catálogo). */
export function quantityInCart(cart: readonly CartLine[], productId: string): number {
  return cart
    .filter((line) => line.kind === 'product' && line.productId === productId)
    .reduce((sum, line) => sum + line.quantity, 0);
}

/** Las líneas tal como las pide `POST /sales`. */
export function saleLines(cart: readonly CartLine[]): SaleLineRequest[] {
  return cart.map((line) =>
    line.kind === 'product'
      ? { kind: 'product', productId: line.productId, quantity: line.quantity }
      : {
          kind: 'concept',
          conceptId: line.conceptId,
          quantity: line.quantity,
          unitPriceMicros: line.unitPriceMicros,
        },
  );
}

/** «12 disponibles», «Quedan 3 · bajo mínimo» o «Agotado», descontando lo que va en el carrito. */
export function availability(
  product: Product,
  inCart: number,
): { text: string; tone: 'ok' | 'low' | 'out' } {
  const left = product.stock - inCart;
  if (left <= 0) return { text: 'Agotado', tone: 'out' };
  if (product.lowStock) return { text: `Quedan ${String(left)} · bajo mínimo`, tone: 'low' };
  return { text: `${String(left)} disponibles`, tone: 'ok' };
}
