// Importes que escribe el personal y métodos de pago, comunes a recargas, combos, tarifas y
// sesiones temporales. El dinero va en µUSD enteros (ADR-0015); aquí solo se lee y se escribe
// como lo teclea el encargado: «5», «5,5», «5,50» o «5.50».
import { type Micros, micros, MICROS_PER_UNIT, type PaymentMethod } from '@pope/shared';

const MICROS_PER_CENT = MICROS_PER_UNIT / 100;

/** Importe mayor que cero en céntimos enteros, o `null` si el texto no lo es. */
export function parseUsd(text: string): Micros | null {
  const match = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const units = Number(match[1]);
  const cents = Number((match[2] ?? '').padEnd(2, '0'));
  const total = units * MICROS_PER_UNIT + cents * MICROS_PER_CENT;
  return total > 0 ? micros(total) : null;
}

/** Importe para un campo de texto: «5,00». Se trunca a céntimos. */
export function formatUsdInput(amount: Micros): string {
  const cents = Math.trunc(amount / MICROS_PER_CENT);
  return `${String(Math.trunc(cents / 100))},${String(cents % 100).padStart(2, '0')}`;
}

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'cash_usd',
  'cash_ves',
  'mobile_payment',
  'pos',
];

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash_usd: 'Efectivo USD',
  cash_ves: 'Efectivo Bs',
  mobile_payment: 'Pago móvil',
  pos: 'Punto de venta',
};
