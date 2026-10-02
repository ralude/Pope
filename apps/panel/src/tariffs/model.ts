// Lógica de la tabla de tarifas (T42) y de los descuentos de los combos (T43), sin React.
import { type Micros, type TariffTable, type Weekday } from '@pope/shared';

/** Nombre de cada día, de lunes (1) a domingo (7), como en ISO 8601. */
export const WEEKDAY_NAME: Record<Weekday, string> = {
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábado',
  7: 'domingo',
};

export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

/** «Lunes» para la tarjeta de un día. */
export function weekdayTitle(weekday: Weekday): string {
  const name = WEEKDAY_NAME[weekday];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Precio de cada día de la tabla, de lunes a domingo. */
export function rateByWeekday(table: TariffTable): Map<Weekday, Micros> {
  return new Map(table.map((day) => [day.weekday, day.rateMicrosPerHour]));
}

/** Resumen de la selección: «Elige al menos un día», «1 día seleccionado»… */
export function selectionText(selected: ReadonlySet<Weekday>): string {
  if (selected.size === 0) return 'Elige al menos un día';
  return selected.size === 1 ? '1 día seleccionado' : `${String(selected.size)} días seleccionados`;
}

/** Días elegidos en orden, para enviarlos al nodo. */
export function sortedWeekdays(selected: ReadonlySet<Weekday>): Weekday[] {
  return WEEKDAYS.filter((day) => selected.has(day));
}
