// Cuándo se agota una sesión y qué avisos toca enviar (REQ-001-24, REQ-001-25).
import { z } from 'zod';

import { type AccountBalances, affordableSeconds, type SessionUsage } from './billing.js';
import { type Seconds, SECONDS_PER_MINUTE, seconds } from './time.js';

/**
 * Segundos que le quedan a una sesión con cuenta: las horas de combo sin usar más lo que
 * aún puede pagar el saldo en dinero. Cuando llega a 0, la sesión se cierra y la PC se
 * bloquea (REQ-001-25). Usa el mismo tope que `applyCheckpoint`, así que el cobro y la
 * cuenta atrás se agotan a la vez.
 */
export function secondsUntilExhausted(usage: SessionUsage, balances: AccountBalances): Seconds {
  const combo = Math.max(0, balances.comboSeconds - usage.comboSecondsUsed);
  const moneyLimit = affordableSeconds(balances.moneyMicros, usage.rateMicrosPerHour);
  const money = Math.max(0, moneyLimit - usage.moneySeconds);
  return seconds(combo + money);
}

/** Tiempo de una sesión temporal (sin cuenta): el comprado y el ya usado. */
export interface TemporaryUsage {
  /** Tiempo pagado: el de apertura más el añadido después (REQ-001-60, REQ-001-70). */
  purchasedSeconds: Seconds;
  usedSeconds: Seconds;
}

/**
 * Aplica `elapsed` segundos a una sesión temporal. Nunca se usa más de lo comprado, un
 * tiempo negativo cuenta como 0 y lo usado nunca baja.
 */
export function applyTemporaryCheckpoint(usage: TemporaryUsage, elapsed: Seconds): TemporaryUsage {
  const used = Math.min(usage.purchasedSeconds, usage.usedSeconds + Math.max(0, elapsed));
  return {
    purchasedSeconds: usage.purchasedSeconds,
    usedSeconds: seconds(Math.max(usage.usedSeconds, used)),
  };
}

/**
 * Tiempo restante de una sesión temporal. Es lo que el nodo guarda en cada latido para
 * poder restaurarla tras un corte (REQ-001-63).
 */
export function temporaryRemaining(usage: TemporaryUsage): Seconds {
  return seconds(Math.max(0, usage.purchasedSeconds - usage.usedSeconds));
}

/** Avisos de fin de tiempo, en minutos restantes (REQ-001-24). */
export const warningMinutesSchema = z.literal([5, 1]);
export type WarningMinutes = z.infer<typeof warningMinutesSchema>;

/** De mayor a menor: el último que se cumple es el más urgente. */
const WARNINGS: readonly WarningMinutes[] = [5, 1];

export interface WarningCheck {
  /** Aviso que hay que enviar ahora, o `null` si no toca ninguno. */
  send: WarningMinutes | null;
  /** Avisos ya enviados, que se guardan para el siguiente cálculo. */
  sent: WarningMinutes[];
}

/**
 * Decide qué aviso enviar según el tiempo restante y los ya enviados (pregunta resuelta
 * de la spec 001):
 *
 * - Un aviso toca cuando el restante es ≤ su umbral y aún no se ha enviado. Si una sesión
 *   empieza con 3 min, el de 5 min sale al empezar.
 * - Si tocan varios a la vez, solo se envía el más urgente y los demás se dan por
 *   enviados, para no mostrar dos avisos seguidos.
 * - Si el restante vuelve a superar un umbral (compró tiempo), ese aviso se rearma.
 */
export function pendingWarnings(remaining: Seconds, sent: readonly WarningMinutes[]): WarningCheck {
  const reached = WARNINGS.filter((w) => remaining <= w * SECONDS_PER_MINUTE);
  const stillSent = sent.filter((w) => reached.includes(w));
  const due = reached.filter((w) => !stillSent.includes(w));
  const send = due.at(-1) ?? null;
  return { send, sent: send === null ? stillSent : [...reached] };
}

/**
 * Segundos hasta el próximo momento que requiere atención de una sesión con `remaining`
 * segundos: el siguiente aviso que aún no se alcanzó, o el agotamiento (REQ-001-24,
 * REQ-001-25). El nodo programa ahí su temporizador. Con `remaining` ≤ 0 no hay espera.
 */
export function secondsUntilAttention(remaining: Seconds): Seconds {
  const ahead = WARNINGS.map((w) => remaining - w * SECONDS_PER_MINUTE).filter((s) => s > 0);
  return seconds(Math.max(0, Math.min(remaining, ...ahead)));
}
