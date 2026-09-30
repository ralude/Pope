// Combos de horas (REQ-001-80, REQ-001-81, ADR-0014): se venden por un precio fijo y dan
// horas que no vencen y valen cualquier día.
import { z } from 'zod';

import { type Micros, micros, microsSchema } from './money.js';
import { idSchema } from './session.js';
import { type TariffTable, weekdaySchema } from './tariff.js';
import { SECONDS_PER_HOUR } from './time.js';

const comboNameSchema = z.string().trim().min(1, 'Pon un nombre al combo').max(100);
const comboPriceSchema = microsSchema.refine((m) => m > 0, 'El precio debe ser mayor que cero');
const comboSecondsSchema = z.int().positive('El combo debe dar tiempo');

/** Cuerpo de `POST /combos`: nombre, precio en µUSD y tiempo en segundos (REQ-001-80). */
export const comboCreateRequestSchema = z.object({
  name: comboNameSchema,
  priceMicros: comboPriceSchema,
  seconds: comboSecondsSchema,
});
export type ComboCreateRequest = z.infer<typeof comboCreateRequestSchema>;

/** Cuerpo de `PATCH /combos/:id`: edición o desactivación (REQ-001-81). */
export const comboUpdateRequestSchema = z
  .object({
    name: comboNameSchema,
    priceMicros: comboPriceSchema,
    seconds: comboSecondsSchema,
    active: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'No hay nada que cambiar');
export type ComboUpdateRequest = z.infer<typeof comboUpdateRequestSchema>;

/** Lo que sale la hora con el combo frente a la tarifa de un día (REQ-001-80). */
export const comboDiscountSchema = z.object({
  weekday: weekdaySchema,
  rateMicrosPerHour: microsSchema,
  /** Porcentaje entero de ahorro frente a ese día; negativo si el combo sale más caro. */
  discountPercent: z.int(),
});
export type ComboDiscount = z.infer<typeof comboDiscountSchema>;

/** Combo tal como lo ve el personal, con su precio por hora y el descuento de cada día. */
export const comboSchema = z.object({
  id: idSchema,
  name: z.string(),
  priceMicros: microsSchema,
  seconds: z.int().positive(),
  active: z.boolean(),
  ratePerHourMicros: microsSchema,
  discounts: z.array(comboDiscountSchema),
});
export type Combo = z.infer<typeof comboSchema>;

/** Precio de una hora con el combo, al µUSD (20 USD por 20 h → 1 USD/h). */
export function comboRatePerHour(priceMicros: Micros, seconds: number): Micros {
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new RangeError(`El combo debe dar tiempo: ${String(seconds)}`);
  }
  return micros(Math.round((priceMicros * SECONDS_PER_HOUR) / seconds));
}

/**
 * Descuento frente a cada día de la tabla, en porcentaje entero redondeado (CA-001-14:
 * 1,00 USD/h es un 33 % menos que 1,50 y un 50 % menos que 2,00).
 */
export function comboDiscounts(ratePerHour: Micros, table: TariffTable): ComboDiscount[] {
  return [...table]
    .sort((a, b) => a.weekday - b.weekday)
    .map((day) => ({
      weekday: day.weekday,
      rateMicrosPerHour: day.rateMicrosPerHour,
      discountPercent: Math.round(
        ((day.rateMicrosPerHour - ratePerHour) * 100) / day.rateMicrosPerHour,
      ),
    }));
}
