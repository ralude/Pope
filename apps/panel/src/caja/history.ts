// Historial de cierres (REQ-005-53): cómo se lee cada caja en la lista, como en el diseño.
import {
  formatMoney,
  LOCAL_TIME_ZONE,
  methodCurrency,
  paymentMethodSchema,
  type ShiftSummary,
} from '@pope/shared';

import { formatIn } from './closing.js';

const day = new Intl.DateTimeFormat('es-VE', {
  timeZone: LOCAL_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'short',
});
const time = new Intl.DateTimeFormat('es-VE', {
  timeZone: LOCAL_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export interface HistoryRow {
  day: string;
  hours: string;
  staff: string;
  pc: string;
  snacks: string;
  other: string;
  total: string;
  /**
   * «Cuadra», «Abierta», «Sin conteo» (cajas cerradas antes de que se contara al cerrar) o las
   * diferencias de cada método en su moneda («-2,00 USD · +10,00 Bs»):
   * no se suman, porque USD y Bs no se pueden juntar sin una tasa.
   */
  difference: string;
  tone: 'ok' | 'open' | 'over' | 'short';
}

export function historyRow(summary: ShiftSummary): HistoryRow {
  const opened = new Date(summary.openedAt);
  const closed = summary.closedAt === null ? null : new Date(summary.closedAt);
  const name = day.format(opened);
  let difference = closed === null ? 'Abierta' : 'Sin conteo';
  let tone: HistoryRow['tone'] = 'open';
  if (summary.difference) {
    const { difference: diff } = summary;
    // Menos de un céntimo es cuadrar: lo contado se escribe en céntimos.
    const off = paymentMethodSchema.options.filter((method) => Math.abs(diff[method]) >= 10_000);
    difference =
      off.length === 0
        ? 'Cuadra'
        : off
            .map((method) => {
              const text = formatIn(methodCurrency(method), diff[method]);
              return diff[method] > 0 ? `+${text}` : text;
            })
            .join(' · ');
    tone = off.length === 0 ? 'ok' : off.some((method) => diff[method] < 0) ? 'short' : 'over';
  }
  return {
    day: name.charAt(0).toUpperCase() + name.slice(1),
    hours: `${time.format(opened)} – ${closed ? time.format(closed) : 'abierta'}`,
    staff: summary.staffName,
    pc: formatMoney(summary.totals.pc),
    snacks: formatMoney(summary.totals.snacks),
    other: formatMoney(summary.totals.other),
    total: formatMoney(summary.totals.total),
    difference,
    tone,
  };
}
