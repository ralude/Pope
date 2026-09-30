// Saldos de las cuentas y sus movimientos (REQ-001-83, REQ-001-89, ADR-0014).
import { z } from 'zod';

import { microsSchema } from './money.js';
import { idSchema } from './session.js';

/** Los dos saldos de una cuenta: dinero (µUSD) y horas de combo (segundos). */
export const walletSchema = z.enum(['money', 'combo']);
export type Wallet = z.infer<typeof walletSchema>;

/**
 * Tipos de movimiento: recarga, compra de combo, consumo de una sesión, ajuste con motivo
 * y saldo migrado desde el sistema anterior (spec 008). Los saldos nunca se editan: solo
 * cambian con movimientos (REQ-001-89).
 */
export const ledgerKindSchema = z.enum([
  'recharge',
  'combo_purchase',
  'consumption',
  'adjustment',
  'migration',
]);
export type LedgerKind = z.infer<typeof ledgerKindSchema>;

/**
 * Copia del combo en el momento de la venta: si después se edita o se desactiva, las horas
 * vendidas no cambian (REQ-001-81, ADR-0014).
 */
export const comboSnapshotSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  priceMicros: microsSchema,
  seconds: z.int().positive(),
});
export type ComboSnapshot = z.infer<typeof comboSnapshotSchema>;

/** Saldos de una cuenta tal como los ve el panel, sin la sesión en curso. */
export const customerBalancesSchema = z.object({
  moneyMicros: microsSchema,
  comboSeconds: z.int().nonnegative(),
});
export type CustomerBalances = z.infer<typeof customerBalancesSchema>;
