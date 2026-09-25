// Dinero en micro-unidades enteras (ADR-0015).
//
// Todo importe es un entero de micro-unidades de su moneda: 1 USD = 1 000 000 µUSD, e
// igual para VES. Nunca se guardan decimales flotantes. Solo se redondea a céntimos al
// mostrar, con `formatMoney`.
import { z } from 'zod';

/** Micro-unidades que tiene una unidad de moneda (6 decimales). */
export const MICROS_PER_UNIT = 1_000_000;

const MICROS_PER_CENT = 10_000;

/**
 * Importe en micro-unidades. Entero seguro (`Number.isSafeInteger`), con signo: los
 * movimientos del ledger pueden ser negativos.
 */
export const microsSchema = z.int().brand<'Micros'>();
export type Micros = z.infer<typeof microsSchema>;

/** Monedas que maneja Pope: precios y saldos en USD, equivalente en bolívares (VES). */
export const currencySchema = z.enum(['USD', 'VES']);
export type Currency = z.infer<typeof currencySchema>;

/** Importe con su moneda. Es la forma en que viajan los importes en eventos y mensajes. */
export const moneySchema = z.object({
  micros: microsSchema,
  currency: currencySchema,
});
export type Money = z.infer<typeof moneySchema>;

/**
 * Tasa de cambio: micro-bolívares (µVES) que vale 1 USD. Por ejemplo, 40 VES/USD es
 * `40 000 000`. La obtiene el nodo del BCV (spec 005).
 */
export const vesRateSchema = z.int().positive().brand<'VesRate'>();
export type VesRate = z.infer<typeof vesRateSchema>;

/** Valida que `value` sea un entero seguro y lo marca como `Micros`. */
export function micros(value: number): Micros {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Importe no válido: ${String(value)} (se esperan micro-unidades enteras)`);
  }
  return value as Micros;
}

/**
 * Convierte dólares escritos como número decimal a µUSD: `usd(1.5)` → `1 500 000`.
 * Pensado para constantes y tests; los importes que escribe una persona se leen como texto.
 */
export function usd(amount: number): Micros {
  if (!Number.isFinite(amount)) {
    throw new RangeError(`Importe no válido: ${String(amount)}`);
  }
  return micros(Math.round(amount * MICROS_PER_UNIT));
}

/** Valida y marca una tasa de cambio en µVES por USD. */
export function vesRate(value: number): VesRate {
  return vesRateSchema.parse(value);
}

/** Convierte µUSD a µVES con la tasa dada, redondeando al micro más cercano. */
export function usdToVes(amount: Micros, rate: VesRate): Micros {
  // El producto puede superar el entero seguro de `number` (p. ej. 1 000 USD a 400 VES/USD
  // son 4·10¹⁷), así que se calcula con BigInt y solo el resultado vuelve a `number`.
  return micros(Number(divRoundHalfUp(BigInt(amount) * BigInt(rate), BigInt(MICROS_PER_UNIT))));
}

/**
 * Redondea µ-unidades a céntimos: al más cercano, la mitad hacia arriba y, en negativos,
 * igual en valor absoluto (-2,245 → -2,25). Pregunta resuelta de la spec 001.
 */
export function roundToCents(amount: Micros): number {
  return Number(divRoundHalfUp(BigInt(amount), BigInt(MICROS_PER_CENT)));
}

export interface FormatMoneyOptions {
  /** Si se indica, añade el equivalente en bolívares: `3,00 USD (≈ 120,00 VES)`. */
  vesRate?: VesRate | undefined;
  /** Texto tras cada código de moneda, p. ej. `/h` para tarifas: `1,50 USD/h`. */
  suffix?: string;
}

/**
 * Formatea un importe en µUSD para mostrarlo: `3,00 USD`, `1.234,56 USD`,
 * `3,00 USD (≈ 120,00 VES)`. Es la única forma de mostrar dinero en la interfaz (ADR-0015).
 */
export function formatMoney(amount: Micros, options: FormatMoneyOptions = {}): string {
  const suffix = options.suffix ?? '';
  const main = `${formatCents(roundToCents(amount))} USD${suffix}`;
  if (options.vesRate === undefined) {
    return main;
  }
  const ves = usdToVes(amount, options.vesRate);
  return `${main} (≈ ${formatCents(roundToCents(ves))} VES${suffix})`;
}

/** `123456` céntimos → `1.234,56`: miles con punto y decimales con coma. */
function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const units = Math.trunc(abs / 100);
  const rest = abs % 100;
  const grouped = String(units).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${grouped},${String(rest).padStart(2, '0')}`;
}

/** División entera redondeando al más cercano, la mitad lejos de cero. `divisor` > 0. */
function divRoundHalfUp(dividend: bigint, divisor: bigint): bigint {
  const abs = dividend < 0n ? -dividend : dividend;
  const rounded = (abs * 2n + divisor) / (divisor * 2n);
  return dividend < 0n ? -rounded : rounded;
}
