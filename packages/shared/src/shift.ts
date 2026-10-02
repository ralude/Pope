// Turno de caja: abrir con el fondo inicial y cerrar contando el dinero por método
// (REQ-001-03, REQ-005-40 a REQ-005-44).
import { z } from 'zod';

import { type CashMethod, cashTotalsSchema, methodCurrency } from './cash.js';
import { type Currency, type Micros, micros, microsSchema } from './money.js';
import { idSchema } from './session.js';
import { type PaymentMethod, paymentMethodSchema } from './wallet.js';

/**
 * Turno de caja de un miembro del personal. Las recargas y los cobros en caja quedan
 * ligados a él (REQ-001-03, REQ-001-60). Cada uno tiene como mucho uno abierto.
 */
export const cashShiftSchema = z.object({
  id: idSchema,
  staffId: idSchema,
  openedAt: z.iso.datetime(),
  /** `null` mientras está abierto. */
  closedAt: z.iso.datetime().nullable(),
});
export type CashShift = z.infer<typeof cashShiftSchema>;

/** Respuesta de `GET /shifts/current`: el turno abierto de quien pregunta, si tiene. */
export const currentShiftResponseSchema = z.object({ shift: cashShiftSchema.nullable() });
export type CurrentShiftResponse = z.infer<typeof currentShiftResponseSchema>;

const nonNegativeMicrosSchema = microsSchema.refine((m) => m >= 0, 'No puede ser negativo');

/**
 * Fondo inicial (REQ-005-40): el efectivo con que se abre la caja, en USD y en Bs. Es el
 * cuerpo de `POST /shifts`.
 */
export const openingCashSchema = z.object({
  cashUsdMicros: nonNegativeMicrosSchema,
  cashVesMicros: nonNegativeMicrosSchema,
});
export type OpeningCash = z.infer<typeof openingCashSchema>;

/**
 * Un importe por cada método de la caja, en la moneda en que se cuenta (`methodCurrency`):
 * lo esperado, lo contado o la diferencia (REQ-005-42). Lleva los cuatro métodos.
 */
export const cashByMethodSchema = z.record(paymentMethodSchema, microsSchema);
export type CashByMethod = z.infer<typeof cashByMethodSchema>;

/** Cuerpo de `POST /shifts/current/close`: lo contado en cada método (REQ-005-42). */
export const shiftCloseRequestSchema = z.object({
  counted: z.record(paymentMethodSchema, nonNegativeMicrosSchema),
});
export type ShiftCloseRequest = z.infer<typeof shiftCloseRequestSchema>;

/** Respuesta de `GET /shifts/current/closing`: lo que hace falta para cerrar. */
export const shiftClosingSchema = z.object({
  shiftId: idSchema,
  openedAt: z.iso.datetime(),
  opening: openingCashSchema,
  expected: cashByMethodSchema,
  totals: cashTotalsSchema,
});
export type ShiftClosing = z.infer<typeof shiftClosingSchema>;

/**
 * Un turno en el historial de cierres (REQ-005-53), y la respuesta al cerrarlo. Lo esperado,
 * lo contado y la diferencia son `null` mientras sigue abierto.
 */
export const shiftSummarySchema = z.object({
  id: idSchema,
  staffName: z.string(),
  openedAt: z.iso.datetime(),
  closedAt: z.iso.datetime().nullable(),
  opening: openingCashSchema,
  totals: cashTotalsSchema,
  expected: cashByMethodSchema.nullable(),
  counted: cashByMethodSchema.nullable(),
  difference: cashByMethodSchema.nullable(),
});
export type ShiftSummary = z.infer<typeof shiftSummarySchema>;

/**
 * Lo esperado en cada método al cerrar (REQ-005-42): el fondo en el efectivo, más lo cobrado
 * en ese método y su moneda. Lo pagado con saldo no está en la caja; los cobros de antes de
 * la spec 005 en un método de Bs (guardados en USD, sin tasa) no se pueden contar en Bs y no
 * entran.
 */
export function expectedCash(
  opening: OpeningCash,
  entries: readonly { method: CashMethod; currency: Currency; amountMicros: Micros }[],
): CashByMethod {
  const sums: Record<PaymentMethod, number> = {
    cash_usd: opening.cashUsdMicros,
    cash_ves: opening.cashVesMicros,
    mobile_payment: 0,
    pos: 0,
  };
  for (const entry of entries) {
    if (entry.method !== 'balance' && entry.currency === methodCurrency(entry.method)) {
      sums[entry.method] += entry.amountMicros;
    }
  }
  return mapMethods((method) => sums[method]);
}

/** Diferencia de cada método: lo contado menos lo esperado (CA-005-03: 45 − 50 = −5). */
export function cashDifference(expected: CashByMethod, counted: CashByMethod): CashByMethod {
  return mapMethods((method) => counted[method] - expected[method]);
}

function mapMethods(value: (method: PaymentMethod) => number): CashByMethod {
  return {
    cash_usd: micros(value('cash_usd')),
    cash_ves: micros(value('cash_ves')),
    mobile_payment: micros(value('mobile_payment')),
    pos: micros(value('pos')),
  };
}
