// Tasa de cambio USD → VES (spec 005, parte 1: tasa manual). Los importes están en USD y se
// muestran también en bolívares a la tasa vigente (REQ-005-30, REQ-001-13). La tasa se guarda
// como `VesRate`: µVES por 1 USD, sin decimales flotantes (ADR-0015).
import { z } from 'zod';

import { MICROS_PER_UNIT, type VesRate, vesRateSchema } from './money.js';
import { utcInstantSchema } from './session.js';
import { LOCAL_TIME_ZONE } from './tariff.js';

/** De dónde sale la tasa: escrita en el panel o consultada al BCV (parte 2). */
export const exchangeRateSourceSchema = z.enum(['manual', 'bcv']);
export type ExchangeRateSource = z.infer<typeof exchangeRateSourceSchema>;

/**
 * Tope de una tasa: 10 000 000 Bs por USD. Frena errores de tecleo con ceros de más; la tasa
 * real está muy por debajo.
 */
export const MAX_VES_PER_USD = 10_000_000 * MICROS_PER_UNIT;

/** Día del calendario en Caracas, `AAAA-MM-DD`: la "fecha valor" de una tasa. */
export const localDateSchema = z.iso.date();

/** Tasa guardada en el nodo (REQ-005-33). */
export const exchangeRateSchema = z.object({
  vesPerUsd: vesRateSchema,
  /** Fecha valor: desde ese día vale. Una tasa manual vale desde el día en que se guarda. */
  effectiveDate: localDateSchema,
  source: exchangeRateSourceSchema,
  /** Cuándo se guardó, en el reloj del nodo. Entre las del mismo día manda la más reciente. */
  obtainedAt: utcInstantSchema,
  /** Quién la escribió (nombre del personal); `null` si vino del BCV. */
  setBy: z.string().nullable(),
});
export type ExchangeRate = z.infer<typeof exchangeRateSchema>;

/**
 * Respuesta de `GET /exchange-rate` y contenido del mensaje `exchangeRate` del canal del
 * panel: la tasa vigente, o `null` si aún no hay ninguna, y si está desactualizada
 * (REQ-005-35, REQ-005-36).
 */
export const exchangeRateStatusSchema = z.object({
  rate: exchangeRateSchema.nullable(),
  stale: z.boolean(),
});
export type ExchangeRateStatus = z.infer<typeof exchangeRateStatusSchema>;

/** Cuerpo de `POST /exchange-rate`: una tasa manual (REQ-005-34). */
export const exchangeRateSetRequestSchema = z.strictObject({
  vesPerUsd: vesRateSchema.refine(
    (rate) => rate <= MAX_VES_PER_USD,
    'La tasa no puede pasar de 10.000.000 Bs por USD',
  ),
});
export type ExchangeRateSetRequest = z.infer<typeof exchangeRateSetRequestSchema>;

// `en-CA` escribe las fechas como AAAA-MM-DD. Se reutiliza un solo formateador (es caro).
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: LOCAL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** El día en Caracas de un instante, `AAAA-MM-DD`. A las 04:00 UTC cambia el día. */
export function localDateInCaracas(instant: Date): string {
  return dateFormatter.format(instant);
}

/**
 * Tasa vigente en un instante (REQ-005-33): entre las que ya valen (guardadas antes de ese
 * instante y con fecha valor de hoy o anterior, en Caracas), la guardada más tarde. Así una
 * tasa manual vale desde que se guarda (REQ-005-34) y una con fecha valor de mañana no
 * cuenta todavía. `null` si no hay ninguna.
 */
export function currentRate<Rate extends { effectiveDate: string; obtainedAt: string }>(
  rates: readonly Rate[],
  now: Date,
): Rate | null {
  const today = localDateInCaracas(now);
  let best: Rate | null = null;
  for (const rate of rates) {
    if (rate.effectiveDate > today || Date.parse(rate.obtainedAt) > now.getTime()) continue;
    if (best === null || Date.parse(rate.obtainedAt) > Date.parse(best.obtainedAt)) {
      best = rate;
    }
  }
  return best;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Días hábiles (de lunes a viernes) que han pasado desde la fecha valor hasta hoy, sin
 * contar la fecha valor. Los feriados todavía no se descuentan (pregunta abierta de la spec
 * 005). Ambas fechas en `AAAA-MM-DD`.
 */
export function businessDaysOld(effectiveDate: string, today: string): number {
  // Al mediodía UTC, el día de la semana no depende de la zona horaria.
  const from = Date.parse(`${effectiveDate}T12:00:00Z`);
  const to = Date.parse(`${today}T12:00:00Z`);
  let days = 0;
  for (let t = from + DAY_MS; t <= to; t += DAY_MS) {
    const weekday = new Date(t).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
  }
  return days;
}

/** Una tasa está desactualizada si tiene más de 1 día hábil de antigüedad (REQ-005-35). */
export function isRateStale(rate: { effectiveDate: string }, now: Date): boolean {
  return businessDaysOld(rate.effectiveDate, localDateInCaracas(now)) > 1;
}

/** `true` si la tasa es un `VesRate` válido dentro del tope. Para validar lo que se escribe. */
export function isAcceptableRate(value: number): value is VesRate {
  return exchangeRateSetRequestSchema.safeParse({ vesPerUsd: value }).success;
}
