// Inventario (spec 005, parte 2): productos con foto y movimientos de stock. El stock nunca se escribe: es la suma de sus
// movimientos (REQ-005-10, REQ-005-11).
import { z } from 'zod';

import { microsSchema } from './money.js';
import { idSchema, utcInstantSchema } from './session.js';

/** Tope de unidades de un movimiento y del stock mínimo: frena un cero de más al teclear. */
export const MAX_STOCK_QUANTITY = 100_000;

/**
 * Fotos de los productos (REQ-005-03, REQ-005-73): el panel las reduce a 512 px de lado como
 * mucho y las sube en WebP; el nodo no acepta otra cosa ni más de 512 KB.
 */
export const PRODUCT_PHOTO_TYPE = 'image/webp';
export const PRODUCT_PHOTO_MAX_BYTES = 512 * 1024;
export const PRODUCT_PHOTO_MAX_SIDE = 512;

const priceSchema = microsSchema.refine((m) => m > 0, 'El precio debe ser mayor que cero');
const quantitySchema = z
  .int('La cantidad debe ser un número entero')
  .positive('La cantidad debe ser mayor que cero')
  .max(MAX_STOCK_QUANTITY, 'Esa cantidad es demasiado grande');
const minStockSchema = z.int().min(0).max(MAX_STOCK_QUANTITY).nullable();
const reasonSchema = z.string().trim().min(1, 'Escribe el motivo').max(200);

// ─── Productos ──────────────────────────────────────────────────────────────────────────

const productNameSchema = z.string().trim().min(1, 'Pon un nombre al producto').max(100);

/**
 * Cuerpo de `POST /products` (REQ-005-01, REQ-005-04). Lo que llegó se guarda como su
 * primera entrada, nunca como una cantidad escrita (REQ-005-10); 0 si aún no hay. Puede darse
 * de alta ya desactivado (mantenedor, T18); si no se dice, sale activo.
 */
export const productCreateRequestSchema = z.object({
  name: productNameSchema,
  priceMicros: priceSchema,
  minStock: minStockSchema,
  initialQuantity: z.int().min(0).max(MAX_STOCK_QUANTITY),
  active: z.boolean().default(true),
});
export type ProductCreateRequest = z.infer<typeof productCreateRequestSchema>;

/** Cuerpo de `PATCH /products/:id`: edición o desactivación. El stock no se edita aquí. */
export const productUpdateRequestSchema = z
  .object({
    name: productNameSchema,
    priceMicros: priceSchema,
    minStock: minStockSchema,
    active: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'No hay nada que cambiar');
export type ProductUpdateRequest = z.infer<typeof productUpdateRequestSchema>;

/** Producto tal como lo ve el personal, con su stock calculado (REQ-005-11, REQ-005-13). */
export const productSchema = z.object({
  id: idSchema,
  name: z.string(),
  priceMicros: microsSchema,
  minStock: z.int().nonnegative().nullable(),
  active: z.boolean(),
  /** Cambia con cada foto nueva, para que la caché del navegador no enseñe la vieja. */
  photoVersion: z.string().min(1).nullable(),
  /** Puede ser negativo si el administrador permite vender sin stock (REQ-005-12). */
  stock: z.int(),
  lowStock: z.boolean(),
});
export type Product = z.infer<typeof productSchema>;

/**
 * Aviso de stock bajo (REQ-005-13): el producto tiene un mínimo y su stock lo ha alcanzado
 * (con mínimo 5, avisa ya con 5, para reponer a tiempo). Sin mínimo no hay aviso.
 */
export function isLowStock(stock: number, minStock: number | null): boolean {
  return minStock !== null && stock <= minStock;
}

/** Ruta de la foto de un producto en el nodo, con su versión; `null` si no tiene. */
export function productPhotoPath(product: Pick<Product, 'id' | 'photoVersion'>): string | null {
  if (product.photoVersion === null) {
    return null;
  }
  return `/products/${product.id}/photo?v=${encodeURIComponent(product.photoVersion)}`;
}

// ─── Movimientos de stock ───────────────────────────────────────────────────────────────

/** Entrada de mercancía, venta, ajuste y merma (REQ-005-10). */
export const stockMovementKindSchema = z.enum(['restock', 'sale', 'adjustment', 'waste']);
export type StockMovementKind = z.infer<typeof stockMovementKindSchema>;

/**
 * Cuerpo de `POST /products/:id/stock` (REQ-005-14). Las ventas no van por aquí. Un ajuste
 * sube o baja (con signo) y una merma siempre baja; los dos llevan motivo.
 */
export const stockMoveRequestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('restock'),
    quantity: quantitySchema,
    reason: reasonSchema.optional(),
  }),
  z.object({
    kind: z.literal('adjustment'),
    quantity: z
      .int('La cantidad debe ser un número entero')
      .min(-MAX_STOCK_QUANTITY)
      .max(MAX_STOCK_QUANTITY)
      .refine((q) => q !== 0, 'El ajuste no puede ser 0'),
    reason: reasonSchema,
  }),
  z.object({ kind: z.literal('waste'), quantity: quantitySchema, reason: reasonSchema }),
]);
export type StockMoveRequest = z.infer<typeof stockMoveRequestSchema>;

/** Cuánto cambia el stock con un movimiento pedido: la merma resta. */
export function stockDelta(request: StockMoveRequest): number {
  return request.kind === 'waste' ? -request.quantity : request.quantity;
}

/** Un movimiento guardado, con la cantidad con signo (REQ-005-10). */
export const stockMovementSchema = z.object({
  id: idSchema,
  productId: idSchema,
  kind: stockMovementKindSchema,
  quantity: z.int(),
  reason: z.string().nullable(),
  /** La venta que lo causó, o la anulada si es su devolución (REQ-005-23). */
  saleId: idSchema.nullable(),
  actorName: z.string(),
  createdAt: utcInstantSchema,
});
export type StockMovement = z.infer<typeof stockMovementSchema>;
