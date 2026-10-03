// La tasa de cambio en el panel (spec 005, parte 1): lectura del valor que escribe el
// encargado y textos de la píldora de la barra superior (REQ-005-34 a REQ-005-36).
import {
  type ExchangeRate,
  type ExchangeRateStatus,
  formatVes,
  isAcceptableRate,
  LOCAL_TIME_ZONE,
  micros,
  MICROS_PER_UNIT,
  type VesRate,
  vesRate,
} from '@pope/shared';

/**
 * Bs por 1 USD como lo teclea el encargado, «40», «40,5» o «36,5432» (hasta 6 decimales, con
 * coma o punto), en µVES. `null` si no es un número o se sale de lo admitido.
 */
export function parseVesRate(text: string): VesRate | null {
  const match = /^(\d{1,8})(?:[.,](\d{1,6}))?$/.exec(text.trim());
  if (!match) return null;
  const value = Number(match[1]) * MICROS_PER_UNIT + Number((match[2] ?? '').padEnd(6, '0'));
  return isAcceptableRate(value) ? vesRate(value) : null;
}

/** «1 USD = 40,00 Bs». */
export function rateText(rate: VesRate): string {
  return `1 USD = ${formatVes(micros(rate))}`;
}

const weekday = new Intl.DateTimeFormat('es-VE', { weekday: 'long', timeZone: 'UTC' });
const when = new Intl.DateTimeFormat('es-VE', {
  timeZone: LOCAL_TIME_ZONE,
  day: 'numeric',
  month: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Día de la semana de una fecha valor (`AAAA-MM-DD`): «lunes». */
export function weekdayOf(effectiveDate: string): string {
  return weekday.format(new Date(`${effectiveDate}T12:00:00Z`));
}

/** Lo que dice la píldora y si avisa (ámbar): sin tasa o desactualizada (REQ-005-35). */
export function ratePill(status: ExchangeRateStatus): { text: string; warn: boolean } {
  if (status.rate === null) return { text: 'Sin tasa', warn: true };
  if (status.stale) return { text: `Tasa del ${weekdayOf(status.rate.effectiveDate)}`, warn: true };
  return { text: `Tasa · ${rateText(status.rate.vesPerUsd)}`, warn: false };
}

/** De dónde salió la tasa y cuándo (REQ-005-36): «Manual, guardada por Ana el 28/9, 15:20». */
export function rateOrigin(rate: ExchangeRate): string {
  const at = when.format(new Date(rate.obtainedAt));
  return rate.source === 'bcv'
    ? `BCV, obtenida el ${at}`
    : `Manual, guardada por ${rate.setBy ?? 'el personal'} el ${at}`;
}
