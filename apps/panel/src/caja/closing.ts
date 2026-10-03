// El cierre de la caja (REQ-005-42): lo esperado en cada método, lo contado y la diferencia,
// cada uno en la moneda en que se cuenta (efectivo USD en USD; lo demás, en Bs).
import {
  type Currency,
  formatMoney,
  formatVes,
  type Micros,
  methodCurrency,
  micros,
  type PaymentMethod,
  paymentMethodSchema,
  type ShiftClosing,
} from '@pope/shared';

import { parseAmount } from '../ui/money.js';
import { CASH_METHOD_LABEL } from './payment.js';

/** Un importe en la moneda de su método. */
export function formatIn(currency: Currency, amount: number): string {
  return currency === 'USD' ? formatMoney(micros(amount)) : formatVes(micros(amount));
}

export interface ClosingRow {
  method: PaymentMethod;
  label: string;
  /** «Fondo 20,00 USD + cobrado 7,00 USD» en el efectivo; «Cobrado» en lo demás. */
  hint: string;
  currency: Currency;
  expected: Micros;
}

export function closingRows(closing: ShiftClosing): ClosingRow[] {
  return paymentMethodSchema.options.map((method) => {
    const currency = methodCurrency(method);
    const expected = closing.expected[method];
    const fund =
      method === 'cash_usd'
        ? closing.opening.cashUsdMicros
        : method === 'cash_ves'
          ? closing.opening.cashVesMicros
          : null;
    return {
      method,
      label: CASH_METHOD_LABEL[method],
      hint:
        fund === null
          ? 'Cobrado'
          : `Fondo ${formatIn(currency, fund)} + cobrado ${formatIn(currency, expected - fund)}`,
      currency,
      expected,
    };
  });
}

/** Lo contado menos lo esperado; `null` si lo contado no se ha escrito o no vale. */
export function difference(row: ClosingRow, countedText: string): Micros | null {
  const counted = parseAmount(countedText);
  return counted === null ? null : micros(counted - row.expected);
}

/** «+2,00 USD», «-2,00 USD» o «0,00 Bs», y si cuadra, sobra o falta. */
export function differenceText(
  row: ClosingRow,
  diff: Micros | null,
): { text: string; tone: 'none' | 'ok' | 'over' | 'short' } {
  if (diff === null) return { text: '—', tone: 'none' };
  // Menos de un céntimo es cuadrar: lo contado se escribe en céntimos.
  if (Math.abs(diff) < 10_000) return { text: formatIn(row.currency, 0), tone: 'ok' };
  const text = formatIn(row.currency, diff);
  return diff > 0 ? { text: `+${text}`, tone: 'over' } : { text, tone: 'short' };
}

/** «Efectivo USD -2,00 USD · Punto de venta +10,00 Bs»: lo que no cuadra, para confirmar. */
export function differencesSummary(
  rows: readonly ClosingRow[],
  counted: Record<string, string>,
): string {
  return rows
    .map((row) => ({ row, diff: differenceText(row, difference(row, counted[row.method] ?? '')) }))
    .filter(({ diff }) => diff.tone === 'over' || diff.tone === 'short')
    .map(({ row, diff }) => `${row.label} ${diff.text}`)
    .join(' · ');
}
