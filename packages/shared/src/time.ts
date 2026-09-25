// Tiempo en segundos enteros (ADR-0015). El cobro es por segundo (REQ-001-23).
import { z } from 'zod';

export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 3600;

/** Duración en segundos. Entero seguro; puede ser negativa solo en cálculos intermedios. */
export const secondsSchema = z.int().brand<'Seconds'>();
export type Seconds = z.infer<typeof secondsSchema>;

/** Valida que `value` sea un entero seguro y lo marca como `Seconds`. */
export function seconds(value: number): Seconds {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Duración no válida: ${String(value)} (se esperan segundos enteros)`);
  }
  return value as Seconds;
}

/** `minutes(30)` → 1 800 s. */
export function minutes(value: number): Seconds {
  return seconds(value * SECONDS_PER_MINUTE);
}

/** `hours(1.5)` → 5 400 s. */
export function hours(value: number): Seconds {
  return seconds(value * SECONDS_PER_HOUR);
}

/**
 * Formatea una duración como `H:MM:SS` (`1:30:00`, `18:00:00`). Las horas no se limitan a
 * 24, porque las horas de combo pueden sumar más (REQ-001-12, REQ-001-88).
 */
export function formatDuration(duration: Seconds): string {
  if (duration < 0) {
    throw new RangeError(`No se puede mostrar una duración negativa: ${String(duration)} s`);
  }
  const h = Math.trunc(duration / SECONDS_PER_HOUR);
  const m = Math.trunc((duration % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const s = duration % SECONDS_PER_MINUTE;
  return `${String(h)}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
