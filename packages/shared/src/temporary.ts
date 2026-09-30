// Sesiones temporales (sin cuenta): las abre el encargado cobrando en caja (REQ-001-60).
import { z } from 'zod';

import { affordableSeconds } from './billing.js';
import { type Micros, micros, microsSchema } from './money.js';
import { idSchema, sessionEndReasonSchema, utcInstantSchema } from './session.js';
import { LOCAL_TIME_ZONE } from './tariff.js';
import { type Seconds, SECONDS_PER_HOUR, SECONDS_PER_MINUTE, seconds } from './time.js';
import { paymentMethodSchema } from './wallet.js';

/**
 * Tope de tiempo de una sesión temporal, en cada cobro: 24 h. Protege de un error al teclear
 * un importe o unos minutos; una persona que necesite más puede pagar otra vez.
 */
export const MAX_TEMPORARY_SECONDS = 24 * SECONDS_PER_HOUR;

const MICROS_PER_CENT = 10_000;

/** Tiempo comprado y lo que se cobra por él. */
export interface TemporaryPurchase {
  seconds: Seconds;
  charge: Micros;
}

/**
 * Cobro de `minutes` minutos a la tarifa dada: el importe se redondea al céntimo más
 * cercano, la mitad hacia arriba, y se dan exactamente los minutos pedidos (25 min a
 * 1,50 USD/h = 0,625 → 0,63 USD). Pregunta resuelta de la spec 001 (REQ-001-60, REQ-001-70).
 */
export function temporaryByMinutes(minutes: number, rateMicrosPerHour: Micros): TemporaryPurchase {
  const duration = seconds(minutes * SECONDS_PER_MINUTE);
  // céntimos = duración × tarifa / (3600 s × 10 000 µUSD/céntimo), redondeado sin pasar por
  // un importe intermedio truncado.
  const divisor = BigInt(SECONDS_PER_HOUR) * BigInt(MICROS_PER_CENT);
  const cents = (2n * BigInt(duration) * BigInt(rateMicrosPerHour) + divisor) / (2n * divisor);
  return { seconds: duration, charge: micros(Number(cents) * MICROS_PER_CENT) };
}

/**
 * Tiempo que paga un importe a la tarifa dada, truncado a segundos: se cobra exactamente el
 * importe indicado (REQ-001-60, REQ-001-70).
 */
export function temporaryByAmount(amount: Micros, rateMicrosPerHour: Micros): TemporaryPurchase {
  return { seconds: affordableSeconds(amount, rateMicrosPerHour), charge: amount };
}

/**
 * Lo que compra una petición (`minutes` o `amountMicros`, uno solo) a la tarifa dada.
 * Sirve para abrir una sesión y para añadirle tiempo.
 */
export function temporaryPurchase(
  input: { minutes?: number | undefined; amountMicros?: number | undefined },
  rateMicrosPerHour: Micros,
): TemporaryPurchase {
  if (input.amountMicros !== undefined) {
    return temporaryByAmount(micros(input.amountMicros), rateMicrosPerHour);
  }
  if (input.minutes !== undefined) {
    return temporaryByMinutes(input.minutes, rateMicrosPerHour);
  }
  throw new RangeError('Indica el tiempo o el importe');
}

/**
 * Nombre por defecto de una sesión temporal: "Temporal · PC 05 · 18:30", con la hora del
 * local (REQ-001-61).
 */
export function defaultTemporaryName(pcName: string, instant: Date): string {
  return `Temporal · ${pcName} · ${formatLocalTime(instant)}`;
}

const localTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: LOCAL_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Hora del local (`18:30`) de un instante UTC, para los textos que ve el personal. */
export function formatLocalTime(instant: Date): string {
  return localTime.format(instant);
}

/** Tiempo que una sesión interrumpida se puede restaurar desde el corte: 48 h (REQ-001-71). */
export const RESTORE_WINDOW_MS = 48 * SECONDS_PER_HOUR * 1000;

/**
 * Importe que cobra el encargado: positivo y en céntimos enteros, porque la caja no puede
 * cobrar fracciones de céntimo (0,005 USD no existe en el mostrador).
 */
const positiveAmountSchema = microsSchema
  .refine((m) => m > 0, 'El importe debe ser mayor que cero')
  .refine((m) => m % MICROS_PER_CENT === 0, 'El importe va en céntimos enteros');
const minutesSchema = z
  .int()
  .positive('Indica al menos 1 minuto')
  .max(MAX_TEMPORARY_SECONDS / SECONDS_PER_MINUTE, 'Como máximo 24 horas');

/** El tiempo (en minutos) o el importe (en µUSD) que paga el cliente: uno solo de los dos. */
const chargeBy = {
  minutes: minutesSchema.optional(),
  amountMicros: positiveAmountSchema.optional(),
};
const exactlyOne = (body: { minutes?: number | undefined; amountMicros?: number | undefined }) =>
  (body.minutes === undefined) !== (body.amountMicros === undefined);
const EXACTLY_ONE_MESSAGE = 'Indica el tiempo (minutes) o el importe (amountMicros), solo uno';

/**
 * Cuerpo de `POST /sessions/temporary` (REQ-001-60, REQ-001-61): la PC, el tiempo o el
 * importe, el método de pago y, si se quiere, un nombre. El turno es el del encargado.
 */
export const temporaryOpenRequestSchema = z
  .strictObject({
    pcId: idSchema,
    name: z.string().trim().min(1).max(60).optional(),
    paymentMethod: paymentMethodSchema,
    ...chargeBy,
  })
  .refine(exactlyOne, EXACTLY_ONE_MESSAGE);
export type TemporaryOpenRequest = z.infer<typeof temporaryOpenRequestSchema>;

/**
 * Cuerpo de `POST /sessions/:id/time`: tiempo o importe adicional, cobrado en caja con la
 * tarifa de la sesión (REQ-001-70).
 */
export const temporaryAddTimeRequestSchema = z
  .strictObject({ paymentMethod: paymentMethodSchema, ...chargeBy })
  .refine(exactlyOne, EXACTLY_ONE_MESSAGE);
export type TemporaryAddTimeRequest = z.infer<typeof temporaryAddTimeRequestSchema>;

/**
 * Cuerpo de `POST /sessions/:id/restore`: la PC donde continúa la sesión interrumpida, la
 * misma u otra que esté libre (REQ-001-67).
 */
export const temporaryRestoreRequestSchema = z.strictObject({ pcId: idSchema });
export type TemporaryRestoreRequest = z.infer<typeof temporaryRestoreRequestSchema>;

const nonNegativeSeconds = z.int().nonnegative().brand<'Seconds'>();

/**
 * Estado de una sesión temporal interrumpida por un corte (REQ-001-66, REQ-001-71):
 * `pending` se puede restaurar, `restored` ya se restauró (solo una vez, REQ-001-68) y
 * `expired` pasó de 48 h desde el corte.
 */
export const temporaryInterruptionSchema = z.object({
  status: z.enum(['pending', 'restored', 'expired']),
  /** El corte: el último latido que llegó al nodo. */
  interruptedAt: utcInstantSchema,
  /** Hasta cuándo se puede restaurar: 48 h después del corte. */
  expiresAt: utcInstantSchema,
  /** Quién la restauró y cuándo, y la sesión nueva; `null` si no se ha restaurado. */
  restoredBy: z.object({ name: z.string(), at: utcInstantSchema, sessionId: idSchema }).nullable(),
});
export type TemporaryInterruption = z.infer<typeof temporaryInterruptionSchema>;

/**
 * ¿Es una sesión interrumpida y en qué estado está? Solo lo son las temporales cerradas por
 * falta de latidos que aún tenían tiempo restante (REQ-001-66); las que cerró el cliente o
 * el encargado, o que se agotaron, no (REQ-001-69). El plazo de 48 h cuenta desde el último
 * latido, no desde el cierre del nodo (CA-001-11).
 */
export function interruptionOf(input: {
  endReason: string | null;
  remainingSeconds: number;
  lastBeatAt: Date;
  restoredBy: { name: string; at: Date; sessionId: string } | null;
  now: Date;
}): TemporaryInterruption | null {
  if (input.endReason !== 'no_heartbeat' || input.remainingSeconds <= 0) {
    return null;
  }
  const expiresAt = new Date(input.lastBeatAt.getTime() + RESTORE_WINDOW_MS);
  let status: TemporaryInterruption['status'] = 'pending';
  if (input.restoredBy) {
    status = 'restored';
  } else if (input.now.getTime() > expiresAt.getTime()) {
    status = 'expired';
  }
  return {
    status,
    interruptedAt: input.lastBeatAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    restoredBy: input.restoredBy && {
      name: input.restoredBy.name,
      at: input.restoredBy.at.toISOString(),
      sessionId: input.restoredBy.sessionId,
    },
  };
}

/**
 * Sesión temporal tal como la ve el personal: lo que muestra el panel y el respaldo
 * (REQ-001-64). `amountMicros` es lo cobrado en total (0 en una restauración).
 */
export const temporarySessionSchema = z.object({
  id: idSchema,
  pc: z.object({ id: idSchema, name: z.string() }),
  name: z.string(),
  status: z.enum(['active', 'ended']),
  purchasedSeconds: nonNegativeSeconds,
  remainingSeconds: nonNegativeSeconds,
  amountMicros: microsSchema,
  rateMicrosPerHour: microsSchema,
  /** Nombre de quien la abrió (REQ-001-31). */
  openedBy: z.string(),
  startedAt: utcInstantSchema,
  endedAt: utcInstantSchema.nullable(),
  endReason: sessionEndReasonSchema.nullable(),
  /** Sesión interrumpida de la que viene, si es una restauración (REQ-001-67). */
  restoredFrom: idSchema.nullable(),
  /** Solo si la cerró un corte y tenía tiempo restante; `null` en el resto. */
  interruption: temporaryInterruptionSchema.nullable(),
});
export type TemporarySession = z.infer<typeof temporarySessionSchema>;

/**
 * Respaldo de sesiones temporales (REQ-001-64): las últimas `keptPerPc` de cada PC más las
 * interrumpidas que siguen pendientes de restaurar, aunque haya más sesiones nuevas
 * (REQ-001-71). De la más reciente a la más antigua.
 */
export const temporaryBackupSchema = z.object({
  keptPerPc: z.int().positive(),
  sessions: z.array(temporarySessionSchema),
});
export type TemporaryBackup = z.infer<typeof temporaryBackupSchema>;

/** "Sesiones interrumpidas" del panel: las pendientes de restaurar (REQ-001-66). */
export const interruptedSessionsSchema = z.object({ sessions: z.array(temporarySessionSchema) });
export type InterruptedSessions = z.infer<typeof interruptedSessionsSchema>;
