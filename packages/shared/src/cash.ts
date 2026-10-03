// Registro de caja (spec 005, parte 2): todo lo cobrado en el turno, una fila por pago y
// grupo. De él salen la lista de movimientos, lo esperado al cerrar y los reportes
// (REQ-005-24, REQ-005-52).
import { z } from 'zod';

import {
  type Currency,
  currencySchema,
  type Micros,
  micros,
  microsSchema,
  roundToCents,
  usdToVes,
  type VesRate,
  vesRateSchema,
} from './money.js';
import { idSchema, utcInstantSchema } from './session.js';
import { paymentMethodSchema } from './wallet.js';

/** µ-unidades de un céntimo. */
const MICROS_PER_CENT = 10_000;

/**
 * Cómo se cobró (REQ-005-21): los métodos de la caja y, además, el saldo de la cuenta del
 * cliente, que no es dinero de la caja (REQ-005-25).
 */
export const cashMethodSchema = z.enum([...paymentMethodSchema.options, 'balance']);
export type CashMethod = z.infer<typeof cashMethodSchema>;

/** Moneda en que se cobra y se cuenta cada método: el efectivo USD y el saldo, en USD. */
export function methodCurrency(method: CashMethod): Currency {
  return method === 'cash_usd' || method === 'balance' ? 'USD' : 'VES';
}

/**
 * De dónde sale cada fila: una venta del mostrador, una recarga, una sesión temporal (al
 * abrirla o al añadir tiempo), un combo vendido en caja o la anulación de una venta.
 */
export const cashSourceSchema = z.enum(['sale', 'recharge', 'temporary', 'combo', 'void']);
export type CashSource = z.infer<typeof cashSourceSchema>;

/** Grupos del reporte (REQ-005-52): horas de PC, golosinas y otras ventas. */
export const cashGroupSchema = z.enum(['pc', 'snacks', 'other']);
export type CashGroup = z.infer<typeof cashGroupSchema>;

/**
 * Importe en Bs de un pago en USD con la tasa, al céntimo: es lo que paga el cliente
 * (CA-005-02: 1,00 USD a 40 Bs son 40,00 Bs).
 */
export function vesAmount(usdMicros: Micros, rate: VesRate): Micros {
  return micros(roundToCents(usdToVes(usdMicros, rate)) * MICROS_PER_CENT);
}

/** Una fila del registro de caja: lo que un pago aporta a un grupo. */
export interface CashPiece {
  group: CashGroup;
  method: CashMethod;
  currency: Currency;
  /** En la moneda del método. */
  amountMicros: Micros;
  usdMicros: Micros;
  /** La tasa aplicada si se cobró en Bs (REQ-005-22). */
  vesRate: VesRate | null;
}

/**
 * Reparte los pagos de un cobro entre sus grupos, en orden: cada pago llena el grupo que
 * falta antes de pasar al siguiente. Un pago en Bs se convierte una sola vez y su importe en
 * Bs se reparte entre sus filas, para que sumen justo lo que pagó el cliente.
 *
 * Lanza un error si los pagos no suman lo que se cobra, o si hay un pago en Bs sin tasa.
 */
export function splitPayments(
  groups: readonly { group: CashGroup; usdMicros: Micros }[],
  payments: readonly { method: CashMethod; usdMicros: Micros }[],
  rate: VesRate | null,
): CashPiece[] {
  const due = groups.reduce((sum, g) => sum + g.usdMicros, 0);
  const paid = payments.reduce((sum, p) => sum + p.usdMicros, 0);
  if (due !== paid) {
    throw new RangeError(`Los pagos (${String(paid)}) no suman lo cobrado (${String(due)})`);
  }
  const left: { group: CashGroup; usd: number }[] = groups.map((g) => ({
    group: g.group,
    usd: g.usdMicros,
  }));
  const pieces: CashPiece[] = [];
  let current = 0;
  for (const payment of payments) {
    const currency = methodCurrency(payment.method);
    if (currency === 'VES' && rate === null) {
      throw new RangeError('No hay tasa de cambio: no se puede cobrar en bolívares');
    }
    const parts: { group: CashGroup; usd: number }[] = [];
    let remaining: number = payment.usdMicros;
    while (remaining > 0) {
      const target = left[current];
      if (target === undefined) {
        break;
      }
      const take = Math.min(remaining, target.usd);
      if (take > 0) {
        parts.push({ group: target.group, usd: take });
        target.usd -= take;
        remaining -= take;
      }
      if (target.usd === 0) {
        current += 1;
      }
    }
    const vesRate = currency === 'VES' ? rate : null;
    const vesTotal = vesRate === null ? 0 : vesAmount(payment.usdMicros, vesRate);
    let vesSoFar = 0;
    parts.forEach((part, index) => {
      const usdMicros = micros(part.usd);
      let amountMicros = usdMicros;
      if (vesRate !== null) {
        // La última fila se queda lo que falta, para no perder ni sumar un céntimo.
        amountMicros =
          index === parts.length - 1 ? micros(vesTotal - vesSoFar) : vesAmount(usdMicros, vesRate);
        vesSoFar += amountMicros;
      }
      pieces.push({
        group: part.group,
        method: payment.method,
        currency,
        amountMicros,
        usdMicros,
        vesRate,
      });
    });
  }
  return pieces;
}

/**
 * Totales del turno por grupo, en USD. Lo pagado con saldo no es dinero de la caja: va
 * aparte en `balance` y no suma en los grupos ni en el total (REQ-005-25).
 */
export const cashTotalsSchema = z.object({
  pc: microsSchema,
  snacks: microsSchema,
  other: microsSchema,
  total: microsSchema,
  balance: microsSchema,
});
export type CashTotals = z.infer<typeof cashTotalsSchema>;

export function cashTotals(
  entries: readonly { group: CashGroup; method: CashMethod; usdMicros: Micros }[],
): CashTotals {
  const sums = { pc: 0, snacks: 0, other: 0, balance: 0 };
  for (const entry of entries) {
    if (entry.method === 'balance') {
      sums.balance += entry.usdMicros;
    } else {
      sums[entry.group] += entry.usdMicros;
    }
  }
  return {
    pc: micros(sums.pc),
    snacks: micros(sums.snacks),
    other: micros(sums.other),
    total: micros(sums.pc + sums.snacks + sums.other),
    balance: micros(sums.balance),
  };
}

/** Cómo se pagó un movimiento, por método (sin el reparto por grupos). */
export const cashMovementPaymentSchema = z.object({
  method: cashMethodSchema,
  currency: currencySchema,
  amountMicros: microsSchema,
  vesRate: vesRateSchema.nullable(),
});
export type CashMovementPayment = z.infer<typeof cashMovementPaymentSchema>;

/**
 * Una línea de una venta en la lista del turno, para el detalle de su fila (REQ-005-24). Un
 * otro ingreso se lee "Otro ingreso · comentario", con cantidad 1.
 */
export const cashMovementLineSchema = z.object({
  kind: z.enum(['product', 'other']),
  name: z.string(),
  quantity: z.int().positive(),
  usdMicros: microsSchema,
});
export type CashMovementLine = z.infer<typeof cashMovementLineSchema>;

/**
 * Una fila de la lista del turno (REQ-005-24): las filas del registro de un mismo cobro,
 * juntas. Las anulaciones llevan importes negativos y el motivo.
 */
export const cashMovementSchema = z.object({
  source: cashSourceSchema,
  /** La venta, recarga, sesión o compra de combo; en una anulación, la venta anulada. */
  sourceId: idSchema,
  at: utcInstantSchema,
  /** Qué fue, como se lee en la lista y en el reporte: "Doritos × 2", "Recarga · juan". */
  description: z.string(),
  /**
   * La cuenta del cobro: quien recarga, compra el combo o paga con su saldo; `null` en las
   * sesiones temporales y en las ventas sin cuenta.
   */
  customerName: z.string().nullable(),
  /** Las líneas de una venta o de su anulación (con importes positivos); vacío en lo demás. */
  lines: z.array(cashMovementLineSchema),
  usdMicros: microsSchema,
  payments: z.array(cashMovementPaymentSchema).min(1),
  /** Quién lo cobró (o anuló). */
  actorName: z.string(),
  /** Venta anulada después; su anulación aparece como otra fila. */
  voided: z.boolean(),
  /** Motivo de una anulación (REQ-005-23); `null` en las demás filas. */
  reason: z.string().nullable(),
});
export type CashMovement = z.infer<typeof cashMovementSchema>;

/** Respuesta de `GET /shifts/current/entries`: el más reciente arriba, con los totales. */
export const shiftEntriesResponseSchema = z.object({
  shiftId: idSchema,
  movements: z.array(cashMovementSchema),
  totals: cashTotalsSchema,
});
export type ShiftEntriesResponse = z.infer<typeof shiftEntriesResponseSchema>;
