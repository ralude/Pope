// Tarifa semanal: cada día de la semana tiene su precio por hora, igual para todas las
// PCs (REQ-001-10). El día se decide con la hora del local, no con la UTC.
import { z } from 'zod';

import { type Micros, microsSchema } from './money.js';

/** Zona horaria del local. Las fechas se guardan en UTC y se interpretan aquí. */
export const LOCAL_TIME_ZONE = 'America/Caracas';

/** Día de la semana según ISO 8601: 1 = lunes … 7 = domingo. */
export const weekdaySchema = z.literal([1, 2, 3, 4, 5, 6, 7]);
export type Weekday = z.infer<typeof weekdaySchema>;

/** Precio por hora de un día, en µUSD por hora (1,50 USD/h = 1 500 000). */
export const tariffDaySchema = z.object({
  weekday: weekdaySchema,
  rateMicrosPerHour: microsSchema.refine((rate) => rate > 0, 'La tarifa debe ser mayor que cero'),
});
export type TariffDay = z.infer<typeof tariffDaySchema>;

/** Tabla semanal completa: exactamente un precio para cada uno de los 7 días. */
export const tariffTableSchema = z
  .array(tariffDaySchema)
  .length(7)
  .refine(
    (days) => new Set(days.map((d) => d.weekday)).size === 7,
    'La tabla debe tener un precio para cada día, sin repetir',
  );
export type TariffTable = z.infer<typeof tariffTableSchema>;

const WEEKDAY_BY_NAME: Readonly<Record<string, Weekday>> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

// Crear un formateador de Intl es caro; se reutiliza uno solo.
const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: LOCAL_TIME_ZONE,
  weekday: 'short',
});

/** Día de la semana en Caracas del instante dado. A las 04:00 UTC cambia el día. */
export function weekdayInCaracas(instant: Date): Weekday {
  const name = weekdayFormatter.format(instant);
  const weekday = WEEKDAY_BY_NAME[name];
  if (weekday === undefined) {
    throw new RangeError(`Fecha no válida: ${String(instant)}`);
  }
  return weekday;
}

/**
 * Tarifa aplicable en un instante: la del día en Caracas. Una sesión la copia al empezar
 * y la mantiene aunque pase la medianoche (REQ-001-14, REQ-001-16).
 */
export function rateFor(table: TariffTable, instant: Date): Micros {
  const weekday = weekdayInCaracas(instant);
  const day = table.find((d) => d.weekday === weekday);
  if (day === undefined) {
    throw new RangeError(`La tabla de tarifas no tiene precio para el día ${String(weekday)}`);
  }
  return day.rateMicrosPerHour;
}
