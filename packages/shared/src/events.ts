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

import { cashMethodSchema } from './cash.js';
import { customerStatusSchema } from './customer.js';
import { exchangeRateSourceSchema, localDateSchema } from './exchange-rate.js';
import { lockBackgroundImageSchema } from './lock-background-image.js';
import { currencySchema, microsSchema, vesRateSchema } from './money.js';
import { idSchema, sessionEndReasonSchema, utcInstantSchema } from './session.js';
import { pauseOverrunSchema, settingKeySchema } from './settings.js';
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

// ─── Mantenimiento (REQ-003-41, REQ-003-44, REQ-003-45) ────────────────────────────────────

export const lockBackgroundChangedEventSchema = event(
  'lock_screen.background_changed',
  1,
  z.strictObject({
    revision: z.int().positive(),
    background: lockBackgroundImageSchema.nullable(),
  }),
).extend({ actor: actorSchema.options[1] });

export const pcMaintenanceStartedEventSchema = event(
  'pc.maintenance_started',
  1,
  z.strictObject({
    maintenanceId: idSchema,
    pc: pcRefSchema,
    source: z.enum(['local', 'panel']),
    startedAt: utcInstantSchema,
  }),
).extend({ actor: actorSchema.options[1] });

export const pcMaintenanceEndedEventSchema = event(
  'pc.maintenance_ended',
  1,
  z.strictObject({
    maintenanceId: idSchema,
    exitId: idSchema,
    pc: pcRefSchema,
    source: z.enum(['local', 'panel']),
    startedAt: utcInstantSchema,
    endedAt: utcInstantSchema,
    durationSeconds: nonNegativeSeconds,
  }),
).extend({ actor: actorSchema.options[1] });

export const staffTechnicalLoginLockedEventSchema = event(
  'staff.technical_login_locked',
  1,
  z.strictObject({
    staffId: idSchema,
    username: z.string().min(1),
    pc: pcRefSchema,
    lockedUntil: utcInstantSchema,
  }),
).extend({ actor: z.strictObject({ kind: z.literal('system') }) });

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

// ─── Pausa de sesión (spec 002) ─────────────────────────────────────────────────────────

/**
 * Sesión con cuenta en pausa: desde ese instante no se cobra (REQ-002-03). Lleva qué pausa es
 * en la sesión y en el día de Caracas (REQ-002-21, REQ-002-24) y hasta cuándo dura, con la
 * duración máxima vigente al empezar (REQ-002-20; mantenedor, 2026-10-03). El actor es el
 * cliente.
 */
export const sessionPausedEventSchema = event(
  'session.paused',
  1,
  z.strictObject({
    sessionId: idSchema,
    pc: pcRefSchema,
    pauseNumber: z.strictObject({
      inSession: z.int().positive(),
      today: z.int().positive(),
    }),
    maxUntil: utcInstantSchema,
  }),
);

/**
 * Pausa quitada (REQ-002-10, REQ-002-13). Quién la quitó es el actor: el cliente desde el
 * Shell o el encargado desde el panel. `unbilledSeconds` es el tiempo que no se cobró: toda la
 * pausa o, si venció con la opción a), hasta `maxUntil` (mantenedor, 2026-10-03).
 */
export const sessionResumedEventSchema = event(
  'session.resumed',
  1,
  z.strictObject({
    sessionId: idSchema,
    pc: pcRefSchema,
    unbilledSeconds: nonNegativeSeconds,
  }),
);

/**
 * La pausa llegó a su duración máxima (REQ-002-22) y se aplicó `action`: volver a cobrar con
 * la PC aún en pausa, o cerrar la sesión (que emite además `session.ended` con el motivo
 * `pause_expired`). El actor es el sistema.
 */
export const sessionPauseExpiredEventSchema = event(
  'session.pause_expired',
  1,
  z.strictObject({
    sessionId: idSchema,
    pc: pcRefSchema,
    action: pauseOverrunSchema,
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

/**
 * Versión 2 (spec 005): los ajustes pueden ser de texto, como el nombre del local
 * (REQ-005-51).
 */
export const settingChangedV2EventSchema = event(
  'setting.changed',
  2,
  z.strictObject({
    key: settingKeySchema,
    from: z.union([z.number().int(), z.string()]),
    to: z.union([z.number().int(), z.string()]),
  }),
);

// ─── Turno de caja ──────────────────────────────────────────────────────────────────────

/** Versión 1 (spec 001): el turno mínimo, sin fondo. Sigue valiendo para los ya guardados. */
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

const nonNegativeMicrosSchema = microsSchema.refine((m) => m >= 0, 'No puede ser negativo');

/** Versión 2 (REQ-005-40): se abre con el fondo inicial en efectivo USD y en efectivo Bs. */
export const shiftOpenedV2EventSchema = event(
  'shift.opened',
  2,
  z.strictObject({
    shiftId: idSchema,
    openingCash: z.strictObject({
      usd: z.strictObject({ micros: nonNegativeMicrosSchema, currency: z.literal('USD') }),
      ves: z.strictObject({ micros: nonNegativeMicrosSchema, currency: z.literal('VES') }),
    }),
  }),
);

/**
 * Versión 2 (REQ-005-42, CA-005-03): se cierra con lo esperado, lo contado y la diferencia
 * de cada método de la caja, en la moneda en que se cuenta.
 */
export const shiftClosedV2EventSchema = event(
  'shift.closed',
  2,
  z.strictObject({
    shiftId: idSchema,
    methods: z.record(
      paymentMethodSchema,
      z.strictObject({
        currency: currencySchema,
        expected: microsSchema,
        counted: nonNegativeMicrosSchema,
        difference: microsSchema,
      }),
    ),
  }),
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

// ─── Cobros en caja, versión 2 (spec 005, REQ-005-22) ───────────────────────────────────

/**
 * Un pago en caja: el método, el importe en la moneda en que se cobró, su equivalente en USD
 * y la tasa aplicada si fue en Bs. Un pago en Bs lleva siempre su tasa, y uno en USD, no.
 */
export const cashDeskPaymentSchema = z
  .strictObject({
    method: paymentMethodSchema,
    amount: z.strictObject({
      micros: microsSchema.refine((m) => m > 0, 'El importe debe ser mayor que cero'),
      currency: currencySchema,
    }),
    usd: positiveUsdSchema,
    vesRate: vesRateSchema.nullable(),
  })
  .refine(
    (payment) => (payment.amount.currency === 'VES') === (payment.vesRate !== null),
    'Un pago en Bs lleva la tasa aplicada, y uno en USD no',
  );

/** Recarga en caja con el pago completo (REQ-001-03, REQ-005-22). */
export const walletRechargedV2EventSchema = event(
  'wallet.recharged',
  2,
  z.strictObject({
    customer: customerRefSchema,
    amount: positiveUsdSchema,
    payment: cashDeskPaymentSchema,
    shiftId: idSchema,
  }),
);

/** Sesión abierta; las temporales, con el pago completo de su cobro en caja. */
export const sessionStartedV2EventSchema = event(
  'session.started',
  2,
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
      payment: cashDeskPaymentSchema,
      shiftId: idSchema,
    }),
  ]),
);

/** Tiempo añadido a una sesión temporal, con el pago completo (REQ-001-70). */
export const sessionTimeAddedV2EventSchema = event(
  'session.time_added',
  2,
  z.strictObject({
    sessionId: idSchema,
    pc: pcRefSchema,
    seconds: positiveSeconds,
    amount: positiveUsdSchema,
    payment: cashDeskPaymentSchema,
    shiftId: idSchema,
  }),
);

/** Compra de combo; en caja, con el pago completo (REQ-001-84, REQ-005-22). */
export const comboPurchasedV2EventSchema = event(
  'combo.purchased',
  2,
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
        payment: cashDeskPaymentSchema,
        shiftId: idSchema,
      }),
      z.strictObject({ via: z.literal('balance') }),
    ]),
    sessionId: idSchema.nullable(),
  }),
);

// ─── Inventario (spec 005, parte 2) ─────────────────────────────────────────────────────

const productRefSchema = z.strictObject({ id: idSchema, name: z.string().min(1) });

const productDataSchema = z.strictObject({
  name: z.string().min(1),
  price: positiveUsdSchema,
  minStock: z.int().nonnegative().nullable(),
  active: z.boolean(),
});

/** Alta de un producto (REQ-005-04). Lo que llegó va aparte, en su `stock.moved`. */
export const productCreatedEventSchema = event(
  'product.created',
  1,
  z.strictObject({ productId: idSchema, product: productDataSchema }),
);

/** Edición o desactivación, con los valores anteriores y los nuevos (REQ-005-02). */
export const productUpdatedEventSchema = event(
  'product.updated',
  1,
  z.strictObject({ productId: idSchema, before: productDataSchema, after: productDataSchema }),
);

/** Foto nueva de un producto (REQ-005-03), con el nombre del archivo que puso el nodo. */
export const productPhotoSetEventSchema = event(
  'product.photo_set',
  1,
  z.strictObject({ product: productRefSchema, photo: z.string().min(1) }),
);

/**
 * Entrada de mercancía, ajuste o merma (REQ-005-10, REQ-005-14), con la cantidad con signo.
 * Los movimientos de una venta y de su anulación van en `sale.recorded` y `sale.voided`.
 */
export const stockMovedEventSchema = event(
  'stock.moved',
  1,
  z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('restock'),
      product: productRefSchema,
      quantity: z.int().positive(),
      reason: z.string().min(1).nullable(),
    }),
    z.strictObject({
      kind: z.literal('adjustment'),
      product: productRefSchema,
      quantity: z.int().refine((q) => q !== 0, 'El ajuste no puede ser 0'),
      reason: z.string().min(1),
    }),
    z.strictObject({
      kind: z.literal('waste'),
      product: productRefSchema,
      quantity: z.int().negative(),
      reason: z.string().min(1),
    }),
  ]),
);

const saleConceptDataSchema = z.strictObject({
  name: z.string().min(1),
  unitPrice: positiveUsdSchema,
  active: z.boolean(),
});

/**
 * Alta de un concepto que se vendía sin inventario, como "Impresiones". Ya no se emite: el
 * otro ingreso sustituyó a los conceptos (REQ-005-05); se queda para leer los guardados.
 */
export const saleConceptCreatedEventSchema = event(
  'sale_concept.created',
  1,
  z.strictObject({ conceptId: idSchema, concept: saleConceptDataSchema }),
);

/** Edición o desactivación de un concepto, con lo anterior y lo nuevo. Ya no se emite. */
export const saleConceptUpdatedEventSchema = event(
  'sale_concept.updated',
  1,
  z.strictObject({
    conceptId: idSchema,
    before: saleConceptDataSchema,
    after: saleConceptDataSchema,
  }),
);

// ─── Ventas del mostrador (spec 005, parte 2) ───────────────────────────────────────────

/** Un pago de la venta, con su moneda y la tasa si se pagó en Bs (REQ-005-22). */
const salePaymentsSchema = z
  .array(
    z.strictObject({
      method: cashMethodSchema,
      amount: z.strictObject({
        micros: microsSchema.refine((m) => m > 0, 'El importe debe ser mayor que cero'),
        currency: currencySchema,
      }),
      usd: positiveUsdSchema,
      vesRate: vesRateSchema.nullable(),
    }),
  )
  .min(1);

/** Una línea de producto, con la copia del nombre y del precio del momento. */
const productSaleLineSchema = {
  id: idSchema,
  name: z.string().min(1),
  quantity: z.int().positive(),
  unitPrice: positiveUsdSchema,
  total: positiveUsdSchema,
};

/**
 * Venta registrada (REQ-005-20 a REQ-005-22): sus líneas, con la copia del nombre y del
 * precio del momento, y sus pagos, con la moneda y la tasa si se pagó en Bs. Las líneas de
 * productos implican su movimiento de stock `sale`. `customer` es quien pagó con su saldo.
 * Versión 1: con los conceptos que sustituyó el otro ingreso; sigue válida para las ya
 * guardadas.
 */
export const saleRecordedEventSchema = event(
  'sale.recorded',
  1,
  z.strictObject({
    saleId: idSchema,
    shiftId: idSchema,
    customer: customerRefSchema.nullable(),
    lines: z
      .array(z.strictObject({ kind: z.enum(['product', 'concept']), ...productSaleLineSchema }))
      .min(1),
    payments: salePaymentsSchema,
    total: positiveUsdSchema,
  }),
);

/**
 * Venta registrada, versión 2 (REQ-005-05): las líneas son productos u otros ingresos, con
 * su importe y su comentario (o `null`).
 */
export const saleRecordedV2EventSchema = event(
  'sale.recorded',
  2,
  z.strictObject({
    saleId: idSchema,
    shiftId: idSchema,
    customer: customerRefSchema.nullable(),
    lines: z
      .array(
        z.discriminatedUnion('kind', [
          z.strictObject({ kind: z.literal('product'), ...productSaleLineSchema }),
          z.strictObject({
            kind: z.literal('other'),
            comment: z.string().min(1).nullable(),
            total: positiveUsdSchema,
          }),
        ]),
      )
      .min(1),
    payments: salePaymentsSchema,
    total: positiveUsdSchema,
  }),
);

/**
 * Venta anulada por el administrador, con motivo (REQ-005-23). Implica devolver el stock,
 * la fila negativa del registro de caja en `shiftId` y, si se pagó con saldo, devolverlo.
 */
export const saleVoidedEventSchema = event(
  'sale.voided',
  1,
  z.strictObject({ saleId: idSchema, shiftId: idSchema, reason: z.string().min(1) }),
);

// ─── Unión de todos los eventos ─────────────────────────────────────────────────────────

export const domainEventSchema = z.discriminatedUnion('type', [
  lockBackgroundChangedEventSchema,
  pcMaintenanceStartedEventSchema,
  pcMaintenanceEndedEventSchema,
  staffTechnicalLoginLockedEventSchema,
  customerCreatedEventSchema,
  customerStatusChangedEventSchema,
  customerLoginLockedEventSchema,
  customerLoginUnlockedEventSchema,
  z.discriminatedUnion('version', [walletRechargedEventSchema, walletRechargedV2EventSchema]),
  comboCreatedEventSchema,
  comboUpdatedEventSchema,
  z.discriminatedUnion('version', [comboPurchasedEventSchema, comboPurchasedV2EventSchema]),
  tariffChangedEventSchema,
  z.discriminatedUnion('version', [settingChangedEventSchema, settingChangedV2EventSchema]),
  z.discriminatedUnion('version', [sessionStartedEventSchema, sessionStartedV2EventSchema]),
  sessionEndedEventSchema,
  sessionRemainingCorrectedEventSchema,
  z.discriminatedUnion('version', [sessionTimeAddedEventSchema, sessionTimeAddedV2EventSchema]),
  sessionRestoredEventSchema,
  sessionPausedEventSchema,
  sessionResumedEventSchema,
  sessionPauseExpiredEventSchema,
  // Dos versiones del mismo tipo: se distinguen por `version`.
  z.discriminatedUnion('version', [shiftOpenedEventSchema, shiftOpenedV2EventSchema]),
  z.discriminatedUnion('version', [shiftClosedEventSchema, shiftClosedV2EventSchema]),
  staffCreatedEventSchema,
  staffStatusChangedEventSchema,
  pcMapChangedEventSchema,
  exchangeRateSetEventSchema,
  productCreatedEventSchema,
  productUpdatedEventSchema,
  productPhotoSetEventSchema,
  stockMovedEventSchema,
  saleConceptCreatedEventSchema,
  saleConceptUpdatedEventSchema,
  z.discriminatedUnion('version', [saleRecordedEventSchema, saleRecordedV2EventSchema]),
  saleVoidedEventSchema,
]);
export type DomainEvent = z.infer<typeof domainEventSchema>;
export type DomainEventType = DomainEvent['type'];
