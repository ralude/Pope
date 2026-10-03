// El cobro de la venta nueva (REQ-005-20 a REQ-005-22, REQ-005-25): un método, como en el
// diseño, o dos con «Dividir pago» (mantenedor, 2026-10-02). El segundo pago lleva su importe
// y el primero cubre lo que falta. En Bs se cobra al céntimo con la tasa vigente.
import {
  type CashMethod,
  type Micros,
  methodCurrency,
  micros,
  type SalePaymentRequest,
  vesAmount,
  type VesRate,
} from '@pope/shared';

import { parseUsd } from '../ui/money.js';

export const CASH_METHODS: readonly CashMethod[] = [
  'cash_usd',
  'cash_ves',
  'mobile_payment',
  'pos',
  'balance',
];

export const CASH_METHOD_LABEL: Record<CashMethod, string> = {
  cash_usd: 'Efectivo USD',
  cash_ves: 'Efectivo Bs',
  mobile_payment: 'Pago móvil',
  pos: 'Punto de venta',
  balance: 'Con saldo',
};

/** Cómo quiere cobrar el encargado: un método y, si divide el pago, un segundo con su importe. */
export interface PaymentChoice {
  method: CashMethod;
  split: { method: CashMethod; text: string } | null;
}

/** Los pagos de `POST /sales`, o lo que falta para poder cobrar. */
export function buildPayments(
  total: Micros,
  choice: PaymentChoice,
): { payments: SalePaymentRequest[] } | { error: string } {
  if (total <= 0) return { error: 'La venta está vacía.' };
  if (!choice.split) return { payments: [{ method: choice.method, usdMicros: total }] };
  const second = parseUsd(choice.split.text);
  if (second === null) return { error: 'Escribe el importe del segundo pago.' };
  if (second >= total) return { error: 'El segundo pago debe ser menor que el total.' };
  if (choice.split.method === choice.method) {
    return { error: 'El segundo pago va con otro método.' };
  }
  return {
    payments: [
      { method: choice.method, usdMicros: micros(total - second) },
      { method: choice.split.method, usdMicros: second },
    ],
  };
}

/** Lo que se cobra en Bs con la tasa, pago a pago (REQ-005-22, CA-005-02). */
export function vesCharges(
  payments: readonly SalePaymentRequest[],
  rate: VesRate,
): { method: CashMethod; ves: Micros }[] {
  return payments
    .filter((payment) => methodCurrency(payment.method) === 'VES')
    .map((payment) => ({ method: payment.method, ves: vesAmount(payment.usdMicros, rate) }));
}

/** ¿Hay algún pago en Bs? Sin tasa, no se puede cobrar (REQ-005-34). */
export function needsRate(payments: readonly SalePaymentRequest[]): boolean {
  return payments.some((payment) => methodCurrency(payment.method) === 'VES');
}

/** ¿Paga alguien con su saldo? Hace falta la cuenta (REQ-005-21). */
export function needsAccount(payments: readonly SalePaymentRequest[]): boolean {
  return payments.some((payment) => payment.method === 'balance');
}
