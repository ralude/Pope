// Lógica de los diálogos de sesiones temporales (T44), sin React: qué compra lo que escribe
// el encargado y cómo se dice el tiempo que se pierde al cerrar.
import {
  MAX_TEMPORARY_SECONDS,
  type Micros,
  SECONDS_PER_MINUTE,
  temporaryByAmount,
  temporaryByMinutes,
  type TemporaryPurchase,
} from '@pope/shared';

import { parseUsd } from '../ui/money.js';

/** Por tiempo (minutos) o por importe (USD), como en el diseño. */
export type ChargeMode = 'minutes' | 'amount';

/** Tiempos rápidos del diseño, en minutos. */
export const QUICK_MINUTES = [30, 60, 120, 180] as const;

/** «30 min», «1 h», «2 h 30 min». */
export function minutesLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${String(rest)} min`;
  return rest === 0
    ? `${String(hours)} h`
    : `${String(hours)} h ${String(rest).padStart(2, '0')} min`;
}

/** Minutos enteros entre 1 y el tope de 24 h, o `null`. */
export function parseMinutes(text: string): number | null {
  if (!/^\d{1,4}$/.test(text.trim())) return null;
  const minutes = Number(text.trim());
  return minutes >= 1 && minutes <= MAX_TEMPORARY_SECONDS / SECONDS_PER_MINUTE ? minutes : null;
}

/** Cuerpo de la petición: `minutes` o `amountMicros`, uno solo. */
export type ChargeBody = { minutes: number } | { amountMicros: Micros };

/**
 * Lo que compra lo escrito a la tarifa dada, con el mismo cálculo que el nodo (pregunta
 * resuelta de la spec 001): por minutos, el importe al céntimo; por importe, los segundos
 * truncados. `null` si lo escrito no vale.
 */
export function chargeOf(
  mode: ChargeMode,
  text: string,
  rateMicrosPerHour: Micros,
): { body: ChargeBody; purchase: TemporaryPurchase } | null {
  if (mode === 'minutes') {
    const minutes = parseMinutes(text);
    if (minutes === null) return null;
    return { body: { minutes }, purchase: temporaryByMinutes(minutes, rateMicrosPerHour) };
  }
  const amount = parseUsd(text);
  if (amount === null) return null;
  const purchase = temporaryByAmount(amount, rateMicrosPerHour);
  if (purchase.seconds <= 0 || purchase.seconds > MAX_TEMPORARY_SECONDS) return null;
  return { body: { amountMicros: amount }, purchase };
}

/** Tiempo que se pierde al cerrar una temporal (REQ-001-69): «25 min», «1 h 05 min». */
export function lossText(remainingSeconds: number): string {
  const minutes = Math.floor(remainingSeconds / SECONDS_PER_MINUTE);
  return minutes === 0 ? 'menos de 1 min' : minutesLabel(minutes);
}
