// Eventos de auditoría y sincronización (REQ-001-30, ADR-0008).
//
// Cada cambio de estado del nodo local genera un evento inmutable, escrito en la misma
// transacción que el cambio. Sirven de auditoría y se envían a la nube (spec 006), que los
// inserta de forma idempotente por `id`. Se versionan por `type` + `version`.
//
// Los eventos llevan una copia de los nombres del momento (encargado, PC, cliente) además
// de los ids: la auditoría se entiende sola y un renombrado no cambia el pasado (pregunta
// resuelta de la spec 001). Todos los objetos son estrictos: un campo inesperado, como una
// contraseña que se colara por error, hace fallar la validación (REQ-001-51).
import { z } from 'zod';

import { customerStatusSchema } from './customer.js';
import { exchangeRateSourceSchema, localDateSchema } from './exchange-rate.js';
import { microsSchema, vesRateSchema } from './money.js';
import { idSchema, sessionEndReasonSchema, utcInstantSchema } from './session.js';
import { settingKeySchema } from './settings.js';
import { staffRoleSchema, staffStatusSchema } from './staff.js';
import { weekdaySchema } from './tariff.js';
import { paymentMethodSchema } from './wallet.js';

const positiveSeconds = z.int().positive().brand<'Seconds'>();
const nonNegativeSeconds = z.int().nonnegative().brand<'Seconds'>();

/** Importe en USD: precios, tarifas, saldos y recargas están en USD (REQ-001-13). */
const usdSchema = z.strictObject({
  micros: microsSchema,
  currency: z.literal('USD'),
});
const positiveUsdSchema = z.strictObject({
  micros: microsSchema.refine((m) => m > 0, 'El importe debe ser mayor que cero'),
  currency: z.literal('USD'),
});

// ─── Referencias con copia del nombre ───────────────────────────────────────────────────

export const pcRefSchema = z.strictObject({ id: idSchema, name: z.string().min(1) });
export const customerRefSchema = z.strictObject({ id: idSchema, username: z.string().min(1) });

/** Quién hizo la acción (REQ-001-30, REQ-001-31). */
export const actorSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('customer'),
    customerId: idSchema,
    username: z.string().min(1),
  }),
  z.strictObject({ kind: z.literal('staff'), staffId: idSchema, name: z.string().min(1) }),
  z.strictObject({ kind: z.literal('system') }),
]);
export type Actor = z.infer<typeof actorSchema>;

// ─── Constructor de eventos ─────────────────────────────────────────────────────────────

function event<const Type extends string, Payload extends z.ZodType>(
  type: Type,
  version: number,
  payload: Payload,
) {
  return z.strictObject({
    id: idSchema,
    type: z.literal(type),
    version: z.literal(version),
    actor: actorSchema,
    occurredAt: utcInstantSchema,
    payload,
  });
}

// ─── Cuentas y saldo ────────────────────────────────────────────────────────────────────

export const customerCreatedEventSchema = event(
  'customer.created',
  1,
  z.strictObject({
    customer: customerRefSchema,
    name: z.string().nullable(),
    phone: z.string().nullable(),
  }),
);

export const customerStatusChangedEventSchema = event(
  'customer.status_changed',
  1,
  z.strictObject({
    customer: customerRefSchema,
    from: customerStatusSchema,
    to: customerStatusSchema,
  }),
);

/**
 * Bloqueo temporal del login tras 5 intentos fallidos (REQ-001-52). Lo decide el sistema:
 * los intentos pueden no ser del cliente. Los fallos sueltos no generan evento (pregunta
 * resuelta de la spec 001).
 */
export const customerLoginLockedEventSchema = event(
  'customer.login_locked',
  1,
  z.strictObject({ customer: customerRefSchema, lockedUntil: utcInstantSchema }),
);

/** El encargado quita el bloqueo por intentos antes de tiempo (T16a). */
export const customerLoginUnlockedEventSchema = event(
  'customer.login_unlocked',
  1,
  z.strictObject({ customer: customerRefSchema }),
);

/** Recarga en caja (REQ-001-03), ligada al turno del encargado. */
export const walletRechargedEventSchema = event(
  'wallet.recharged',
  1,
  z.strictObject({
    customer: customerRefSchema,
    amount: positiveUsdSchema,
    paymentMethod: paymentMethodSchema,
    shiftId: idSchema,
  }),
);

// ─── Combos (ADR-0014) ──────────────────────────────────────────────────────────────────

const comboDataSchema = z.strictObject({
  name: z.string().min(1),
  price: positiveUsdSchema,
  seconds: positiveSeconds,
  active: z.boolean(),
});

export const comboCreatedEventSchema = event(
  'combo.created',
  1,
  z.strictObject({ comboId: idSchema, combo: comboDataSchema }),
);

/** Edición o desactivación, con los valores anteriores y los nuevos (REQ-001-81). */
export const comboUpdatedEventSchema = event(
  'combo.updated',
  1,
  z.strictObject({ comboId: idSchema, before: comboDataSchema, after: comboDataSchema }),
);

/**
 * Compra de combo: en caja, con método de pago y turno (REQ-001-84), o con el saldo en
 * dinero (REQ-001-85). Guarda la copia del combo vendido. `sessionId` indica que se compró
 * desde el Shell durante una sesión.
 */
export const comboPurchasedEventSchema = event(
  'combo.purchased',
  1,
  z.strictObject({
    customer: customerRefSchema,
    combo: z.strictObject({
      id: idSchema,
      name: z.string().min(1),
      price: positiveUsdSchema,
      seconds: positiveSeconds,
    }),
    payment: z.discriminatedUnion('via', [
      z.strictObject({
        via: z.literal('cash_desk'),
        paymentMethod: paymentMethodSchema,
        shiftId: idSchema,
      }),
      z.strictObject({ via: z.literal('balance') }),
    ]),
    sessionId: idSchema.nullable(),
  }),
);

// ─── Tarifas ────────────────────────────────────────────────────────────────────────────

/** Cambio de uno o varios días, con el precio anterior y el nuevo (REQ-001-15). */
export const tariffChangedEventSchema = event(
  'tariff.changed',
  1,
  z.strictObject({
    changes: z
      .array(z.strictObject({ weekday: weekdaySchema, from: usdSchema, to: usdSchema }))
      .min(1),
  }),
);

// ─── Sesiones ───────────────────────────────────────────────────────────────────────────

/**
 * Sesión abierta. Quién la abrió es el `actor`: el cliente o el encargado (REQ-001-31,
 * CA-001-04). Las temporales llevan el cobro en caja (REQ-001-60).
 */
export const sessionStartedEventSchema = event(
  'session.started',
  1,
  z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('account'),
      sessionId: idSchema,
      pc: pcRefSchema,
      customer: customerRefSchema,
      rate: usdSchema,
    }),
    z.strictObject({
      kind: z.literal('temporary'),
      sessionId: idSchema,
      pc: pcRefSchema,
      name: z.string().min(1),
      rate: usdSchema,
      purchasedSeconds: positiveSeconds,
      amount: positiveUsdSchema,
      paymentMethod: paymentMethodSchema,
      shiftId: idSchema,
    }),
  ]),
);

/**
 * Sesión cerrada, con el motivo (REQ-001-31) y lo consumido. `billedUntil` es el último
 * instante cobrado: en un cierre sin latidos, el último latido (REQ-001-27, CA-001-03).
 */
export const sessionEndedEventSchema = event(
  'session.ended',
  1,
  z.strictObject({
    sessionId: idSchema,
    pc: pcRefSchema,
    reason: sessionEndReasonSchema,
    billedUntil: utcInstantSchema,
    usage: z.discriminatedUnion('kind', [
      z.strictObject({
        kind: z.literal('account'),
        comboSecondsUsed: nonNegativeSeconds,
        moneySeconds: nonNegativeSeconds,
        moneyCharged: usdSchema,
      }),
      z.strictObject({
        kind: z.literal('temporary'),
        purchasedSeconds: nonNegativeSeconds,
        usedSeconds: nonNegativeSeconds,
        remainingSeconds: nonNegativeSeconds,
      }),
    ]),
  }),
);

/**
 * Corrección del tiempo restante de una sesión temporal cerrada "sin latidos": la PC
 * reconectó y informó menos tiempo del que guardaba el nodo, y se queda el menor (pregunta
 * resuelta de la spec 001, REQ-001-27).
 */
export const sessionRemainingCorrectedEventSchema = event(
  'session.remaining_corrected',
  1,
  z.strictObject({
    sessionId: idSchema,
    pc: pcRefSchema,
    from: nonNegativeSeconds,
    to: nonNegativeSeconds,
  }),
);

/** Tiempo añadido a una sesión temporal, cobrado en caja (REQ-001-70). */
export const sessionTimeAddedEventSchema = event(
  'session.time_added',
  1,
  z.strictObject({
    sessionId: idSchema,
    pc: pcRefSchema,
    seconds: positiveSeconds,
    amount: positiveUsdSchema,
    paymentMethod: paymentMethodSchema,
    shiftId: idSchema,
  }),
);

/**
 * Restauración de una sesión temporal interrumpida en una PC libre, sin nuevo cobro y
 * enlazada a la original (REQ-001-67, REQ-001-68).
 */
export const sessionRestoredEventSchema = event(
  'session.restored',
  1,
  z.strictObject({
    sessionId: idSchema,
    restoredFrom: idSchema,
    pc: pcRefSchema,
    name: z.string().min(1),
    seconds: positiveSeconds,
  }),
);

// ─── Personal (REQ-001-40) ─────────────────────────────────────────────────────────────

/**
 * Alta de un miembro del personal, también la del primer administrador por la CLI (actor
 * `system`). Los logins no generan eventos (pregunta resuelta de la spec 001).
 */
export const staffCreatedEventSchema = event(
  'staff.created',
  1,
  z.strictObject({
    staff: z.strictObject({ id: idSchema, username: z.string().min(1) }),
    name: z.string().min(1),
    role: staffRoleSchema,
  }),
);

/**
 * Activación o desactivación de un miembro del personal (T14d, pregunta resuelta de la
 * spec 001), con el estado anterior y el nuevo.
 */
export const staffStatusChangedEventSchema = event(
  'staff.status_changed',
  1,
  z.strictObject({
    staff: z.strictObject({ id: idSchema, username: z.string().min(1) }),
    from: staffStatusSchema,
    to: staffStatusSchema,
  }),
);

// ─── Ajustes del nodo ───────────────────────────────────────────────────────────────────

/** Un ajuste cambiado por el administrador, con su valor anterior y el nuevo. */
export const settingChangedEventSchema = event(
  'setting.changed',
  1,
  z.strictObject({ key: settingKeySchema, from: z.number().int(), to: z.number().int() }),
);

// ─── Turno de caja (mínimo; lo amplía la spec 005) ──────────────────────────────────────

export const shiftOpenedEventSchema = event(
  'shift.opened',
  1,
  z.strictObject({ shiftId: idSchema }),
);

export const shiftClosedEventSchema = event(
  'shift.closed',
  1,
  z.strictObject({ shiftId: idSchema }),
);

// ─── Mapa de PCs ────────────────────────────────────────────────────────────────────────

// Sin el tope de filas y columnas del panel: si el mapa crece, los eventos viejos siguen
// siendo válidos.
const mapCellSchema = z.strictObject({ row: z.int().nonnegative(), col: z.int().nonnegative() });

/**
 * El administrador guardó la distribución del mapa (REQ-001-45). Solo van las PCs que
 * cambian, con su casilla anterior y la nueva (`null`: sin posición).
 */
export const pcMapChangedEventSchema = event(
  'pc.map_changed',
  1,
  z.strictObject({
    changes: z
      .array(
        z.strictObject({
          pc: pcRefSchema,
          from: mapCellSchema.nullable(),
          to: mapCellSchema.nullable(),
        }),
      )
      .min(1),
  }),
);

// ─── Tasa de cambio (spec 005) ──────────────────────────────────────────────────────────

/**
 * Se guardó una tasa de cambio (REQ-005-33, REQ-005-34): a mano desde el panel, con el
 * personal como actor, o del BCV (parte 2), con el sistema como actor.
 */
export const exchangeRateSetEventSchema = event(
  'exchange_rate.set',
  1,
  z.strictObject({
    vesPerUsd: vesRateSchema,
    effectiveDate: localDateSchema,
    source: exchangeRateSourceSchema,
  }),
);

// ─── Unión de todos los eventos ─────────────────────────────────────────────────────────

export const domainEventSchema = z.discriminatedUnion('type', [
  customerCreatedEventSchema,
  customerStatusChangedEventSchema,
  customerLoginLockedEventSchema,
  customerLoginUnlockedEventSchema,
  walletRechargedEventSchema,
  comboCreatedEventSchema,
  comboUpdatedEventSchema,
  comboPurchasedEventSchema,
  tariffChangedEventSchema,
  settingChangedEventSchema,
  sessionStartedEventSchema,
  sessionEndedEventSchema,
  sessionRemainingCorrectedEventSchema,
  sessionTimeAddedEventSchema,
  sessionRestoredEventSchema,
  shiftOpenedEventSchema,
  shiftClosedEventSchema,
  staffCreatedEventSchema,
  staffStatusChangedEventSchema,
  pcMapChangedEventSchema,
  exchangeRateSetEventSchema,
]);
export type DomainEvent = z.infer<typeof domainEventSchema>;
export type DomainEventType = DomainEvent['type'];
