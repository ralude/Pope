// Ventas del mostrador (spec 005, parte 2): golosinas del inventario y otros ingresos sin
// inventario, pagadas con uno o varios métodos (REQ-005-05, REQ-005-20, REQ-005-21).
import { z } from 'zod';

import { type CashGroup, cashMethodSchema } from './cash.js';
import { type Micros, micros, microsSchema } from './money.js';
import { idSchema } from './session.js';

/** Tope de unidades de una línea: frena un cero de más al teclear. */
export const MAX_SALE_LINE_QUANTITY = 9_999;

const lineQuantitySchema = z
  .int('La cantidad debe ser un número entero')
  .positive('La cantidad debe ser mayor que cero')
  .max(MAX_SALE_LINE_QUANTITY, 'Esa cantidad es demasiado grande');
const positiveMicrosSchema = microsSchema.refine(
  (m) => m > 0,
  'El importe debe ser mayor que cero',
);

/** Tope del comentario de un otro ingreso. */
export const MAX_OTHER_COMMENT_LENGTH = 80;

/** Comentario de un otro ingreso (REQ-005-05): opcional; vacío o en blanco, `null`. */
const otherCommentSchema = z
  .string()
  .trim()
  .max(
    MAX_OTHER_COMMENT_LENGTH,
    `El comentario no puede pasar de ${String(MAX_OTHER_COMMENT_LENGTH)} caracteres`,
  )
  .nullable()
  .transform((comment) => (comment === '' ? null : comment));

/**
 * Un otro ingreso (REQ-005-05): lo que no es golosina ni horas de PC, con el importe que
 * escribe el encargado y un comentario si quiere.
 */
export const otherSaleLineRequestSchema = z.object({
  kind: z.literal('other'),
  usdMicros: positiveMicrosSchema,
  comment: otherCommentSchema,
});
export type OtherSaleLineRequest = z.infer<typeof otherSaleLineRequestSchema>;

/**
 * Una línea de la venta. El precio de un producto lo pone el nodo; el importe de un otro
 * ingreso lo escribe el encargado. La línea `concept` se quita en T28b, cuando el panel
 * ya no la use.
 */
export const saleLineRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('product'), productId: idSchema, quantity: lineQuantitySchema }),
  otherSaleLineRequestSchema,
  z.object({
    kind: z.literal('concept'),
    conceptId: idSchema,
    quantity: lineQuantitySchema,
    unitPriceMicros: positiveMicrosSchema,
  }),
]);
export type SaleLineRequest = z.infer<typeof saleLineRequestSchema>;

/** Un pago, por su importe en USD; si es en Bs, el nodo lo convierte con la tasa vigente. */
export const salePaymentRequestSchema = z.object({
  method: cashMethodSchema,
  usdMicros: positiveMicrosSchema,
});
export type SalePaymentRequest = z.infer<typeof salePaymentRequestSchema>;

/**
 * Cuerpo de `POST /sales`. Que los pagos sumen el total lo comprueba el nodo, que conoce
 * los precios de los productos.
 */
export const saleRequestSchema = z
  .object({
    lines: z.array(saleLineRequestSchema).min(1, 'La venta está vacía').max(50),
    payments: z.array(salePaymentRequestSchema).min(1, 'Falta el pago').max(5),
    /** La cuenta que paga con su saldo (REQ-005-21); solo si uno de los pagos es con saldo. */
    customerId: idSchema.nullable(),
  })
  .refine(
    (sale) => new Set(sale.payments.map((p) => p.method)).size === sale.payments.length,
    'Cada método de pago va una sola vez',
  )
  .refine(
    (sale) => sale.payments.some((p) => p.method === 'balance') === (sale.customerId !== null),
    'El pago con saldo necesita la cuenta del cliente, y solo él',
  );
export type SaleRequest = z.infer<typeof saleRequestSchema>;

/** Importe de una línea: cantidad por precio por unidad. */
export function lineTotal(quantity: number, unitPriceMicros: Micros): Micros {
  return micros(quantity * unitPriceMicros);
}

/** Nombre con que se guarda un otro ingreso, y su descripción en la lista y el reporte. */
export const OTHER_INCOME_NAME = 'Otro ingreso';

/** "Otro ingreso · 20 impresiones", o "Otro ingreso" sin comentario (REQ-005-05). */
export function otherIncomeLabel(comment: string | null): string {
  return comment === null ? OTHER_INCOME_NAME : `${OTHER_INCOME_NAME} · ${comment}`;
}

/** Grupo del reporte de cada línea (REQ-005-52): productos a golosinas; lo demás, a otras. */
export function saleLineGroup(kind: SaleLineRequest['kind']): CashGroup {
  return kind === 'product' ? 'snacks' : 'other';
}

/**
 * Lo que suma una venta en cada grupo, en el orden en que aparecen sus líneas. Es lo que
 * reparte `splitPayments`.
 */
export function saleGroupTotals(
  lines: readonly {
    kind: SaleLineRequest['kind'];
    totalMicros: Micros;
  }[],
): { group: CashGroup; usdMicros: Micros }[] {
  const totals = new Map<CashGroup, number>();
  for (const line of lines) {
    const group = saleLineGroup(line.kind);
    totals.set(group, (totals.get(group) ?? 0) + line.totalMicros);
  }
  return [...totals].map(([group, usd]) => ({ group, usdMicros: micros(usd) }));
}

/** Cuerpo de `POST /sales/:id/void`: solo el administrador, con motivo (REQ-005-23). */
export const saleVoidRequestSchema = z.object({
  reason: z.string().trim().min(1, 'Escribe el motivo').max(200),
});
export type SaleVoidRequest = z.infer<typeof saleVoidRequestSchema>;
