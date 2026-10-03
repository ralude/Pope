// Lógica de la página de Inventario (spec 005, REQ-005-10 a REQ-005-14): estado de cada
// producto, búsqueda por nombre y lectura de las cantidades que teclea el personal.
import {
  LOCAL_TIME_ZONE,
  MAX_STOCK_QUANTITY,
  type Product,
  type StockMovement,
} from '@pope/shared';

/** Estado de un producto en la lista, como en el diseño. */
export type ProductStatus = 'inactive' | 'out' | 'low' | 'ok';

export const STATUS_LABEL: Record<ProductStatus, string> = {
  inactive: 'Desactivado',
  out: 'Agotado',
  low: 'Bajo mínimo',
  ok: 'Bien',
};

/** Desactivado, agotado (0 o menos), bajo mínimo (REQ-005-13, lo dice el nodo) o bien. */
export function productStatus(product: Product): ProductStatus {
  if (!product.active) return 'inactive';
  if (product.stock <= 0) return 'out';
  if (product.lowStock) return 'low';
  return 'ok';
}

/** Texto sin mayúsculas ni tildes, para buscar «pepito» y encontrar «Pepito». */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Los productos o conceptos cuyo nombre contiene lo buscado; sin búsqueda, todos. */
export function filterByName<T extends { name: string }>(items: readonly T[], query: string): T[] {
  const wanted = normalize(query);
  return wanted === '' ? [...items] : items.filter((item) => normalize(item.name).includes(wanted));
}

/** Iniciales para cuando el producto no tiene foto: «Doritos 45 g» → «D4». */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase();
}

/**
 * Cantidad entera que teclea el personal. Las entradas y mermas son positivas; un ajuste
 * puede llevar signo («-2») pero no ser 0. `null` si no vale.
 */
export function parseQuantity(text: string, signed = false): number | null {
  const match = (signed ? /^[-+]?\d{1,6}$/ : /^\d{1,6}$/).exec(text.trim());
  if (!match) return null;
  const value = Number(match[0]);
  if (value === 0 || Math.abs(value) > MAX_STOCK_QUANTITY) return null;
  if (!signed && value < 0) return null;
  return value;
}

/** Qué fue un movimiento: una venta que vuelve (positiva) es una venta anulada. */
export function movementLabel(movement: StockMovement): string {
  switch (movement.kind) {
    case 'restock':
      return 'Entrada';
    case 'sale':
      return movement.quantity > 0 ? 'Venta anulada' : 'Venta';
    case 'adjustment':
      return 'Ajuste';
    case 'waste':
      return 'Merma';
  }
}

/** «+12» o «−1», con el signo menos tipográfico. */
export function formatQuantity(quantity: number): string {
  return quantity > 0 ? `+${String(quantity)}` : `−${String(-quantity)}`;
}

const when = new Intl.DateTimeFormat('es-VE', {
  timeZone: LOCAL_TIME_ZONE,
  day: 'numeric',
  month: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** «28/9, 17:45 · Ana · bolsa rota»: cuándo (hora de Caracas), quién y el motivo, si hay. */
export function movementDetail(movement: StockMovement): string {
  return [when.format(new Date(movement.createdAt)), movement.actorName, movement.reason]
    .filter((part) => part !== null && part !== '')
    .join(' · ');
}

/**
 * Un número entero de 0 en adelante, o nada: el stock mínimo (opcional) o lo que llegó al dar
 * de alta (vacío es 0). `null` si está vacío y `undefined` si no vale.
 */
export function parseCount(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d{1,6}$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return value > MAX_STOCK_QUANTITY ? undefined : value;
}
