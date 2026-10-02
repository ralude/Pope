// Lógica de la administración de combos (T43, REQ-001-80), sin React: leer las horas que
// escribe el administrador y agrupar el descuento frente a la tarifa de cada día.
import {
  comboDiscounts,
  comboRatePerHour,
  formatMoney,
  type Micros,
  SECONDS_PER_HOUR,
  type TariffTable,
  type Weekday,
} from '@pope/shared';

import { WEEKDAY_NAME } from '../tariffs/model.js';

/** Horas del combo («20», «1,5») en segundos enteros, o `null` si no es un número > 0. */
export function parseHours(text: string): number | null {
  const match = /^(\d{1,4})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const hours = Number(`${match[1] ?? '0'}.${match[2] ?? '0'}`);
  const total = Math.round(hours * SECONDS_PER_HOUR);
  return total > 0 ? total : null;
}

/** Horas para el campo de texto: 72 000 s → «20»; 5 400 s → «1,5». */
export function formatHoursInput(seconds: number): string {
  const hours = Math.round((seconds / SECONDS_PER_HOUR) * 100) / 100;
  return String(hours).replace('.', ',');
}

/** Tramo de días seguidos con el mismo precio y el descuento del combo frente a él. */
export interface DiscountRun {
  from: Weekday;
  to: Weekday;
  rateMicrosPerHour: Micros;
  /** Porcentaje entero de ahorro; negativo si el combo sale más caro. */
  discountPercent: number;
}

/**
 * Descuento frente a cada tramo de días seguidos con el mismo precio (decidido por el
 * mantenedor): lunes–miércoles a 1,50 y jueves–domingo a 2,00 son dos tramos.
 */
export function discountRuns(rate: Micros, table: TariffTable): DiscountRun[] {
  const runs: DiscountRun[] = [];
  for (const day of comboDiscounts(rate, table)) {
    const last = runs.at(-1);
    if (last?.rateMicrosPerHour === day.rateMicrosPerHour && last.to + 1 === day.weekday) {
      last.to = day.weekday;
    } else {
      runs.push({
        from: day.weekday,
        to: day.weekday,
        rateMicrosPerHour: day.rateMicrosPerHour,
        discountPercent: day.discountPercent,
      });
    }
  }
  return runs;
}

/** «de lunes a miércoles», «viernes y sábado» o «el domingo». */
export function runDays(run: Pick<DiscountRun, 'from' | 'to'>): string {
  if (run.from === run.to) return `el ${WEEKDAY_NAME[run.from]}`;
  if (run.to === run.from + 1) return `${WEEKDAY_NAME[run.from]} y ${WEEKDAY_NAME[run.to]}`;
  return `de ${WEEKDAY_NAME[run.from]} a ${WEEKDAY_NAME[run.to]}`;
}

/** «33 % menos que de lunes a miércoles (1,50 USD/h)». */
export function discountLine(run: DiscountRun): string {
  const percent = run.discountPercent;
  const comparison =
    percent > 0
      ? `${String(percent)} % menos que`
      : percent < 0
        ? `${String(-percent)} % más que`
        : 'Lo mismo que';
  return `${comparison} ${runDays(run)} (${formatMoney(run.rateMicrosPerHour, { suffix: '/h' })})`;
}

/** Precio por hora del combo y su descuento por tramos (lo que se ve mientras se escribe). */
export function comboPreview(
  priceMicros: Micros,
  seconds: number,
  table: TariffTable,
): { rate: Micros; lines: string[] } {
  const rate = comboRatePerHour(priceMicros, seconds);
  return { rate, lines: discountRuns(rate, table).map(discountLine) };
}
