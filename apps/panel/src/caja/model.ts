// La venta nueva de la Caja (spec 005, REQ-005-20): el carrito con golosinas y otros
// ingresos, y su total. Todo en µUSD enteros (ADR-0015).
import {
  lineTotal,
  type Micros,
  micros,
  OTHER_INCOME_NAME,
  type Product,
  type SaleLineRequest,
} from '@pope/shared';

/**
 * Una línea del carrito. Un otro ingreso lleva el importe que escribió el encargado y su
 * comentario, que es también su nombre en el carrito, como en el diseño (REQ-005-05).
 */
export type CartLine =
  | { kind: 'product'; productId: string; name: string; unitPriceMicros: Micros; quantity: number }
  | {
      kind: 'other';
      comment: string | null;
      name: string;
      unitPriceMicros: Micros;
      quantity: number;
    };

/** Solo se juntan las golosinas iguales: cada otro ingreso es su propia línea. */
function sameItem(line: CartLine, other: CartLine): boolean {
  return line.kind === 'product' && other.kind === 'product' && line.productId === other.productId;
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

/** Un otro ingreso con su importe y su comentario, recortado; vacío, sin comentario (REQ-005-05). */
export function addOther(
  cart: readonly CartLine[],
  usdMicros: Micros,
  comment: string,
): CartLine[] {
  const trimmed = comment.trim();
  return add(cart, {
    kind: 'other',
    comment: trimmed === '' ? null : trimmed,
    name: trimmed === '' ? OTHER_INCOME_NAME : trimmed,
    unitPriceMicros: usdMicros,
    quantity: 1,
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

/**
 * Las líneas tal como las pide `POST /sales`. Un otro ingreso con «+» va repetido: el nodo
 * guarda cada otro ingreso con cantidad 1.
 */
export function saleLines(cart: readonly CartLine[]): SaleLineRequest[] {
  return cart.flatMap((line): SaleLineRequest[] =>
    line.kind === 'product'
      ? [{ kind: 'product', productId: line.productId, quantity: line.quantity }]
      : Array.from({ length: line.quantity }, () => ({
          kind: 'other' as const,
          usdMicros: line.unitPriceMicros,
          comment: line.comment,
        })),
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
