// Motor de cobro de las sesiones con cuenta (plan 001, "Motor de cobro").
//
// Funciones puras: el nodo local las llama en cada latido con su propio reloj
// (ADR-0007). Primero se gastan las horas de combo y después el saldo en dinero
// (REQ-001-87). El importe cobrado se recalcula siempre sobre el total de segundos, así
// que da igual en cuántos latidos se parta la sesión: no hay deriva (ADR-0015).
import { type Micros, micros } from './money.js';
import { type Seconds, SECONDS_PER_HOUR, seconds } from './time.js';

/** Saldos de una cuenta (ADR-0014): dinero en µUSD y horas de combo en segundos. */
export interface AccountBalances {
  moneyMicros: Micros;
  comboSeconds: Seconds;
}

/** Lo consumido en una sesión con cuenta. Se guarda en la fila de `sessions`. */
export interface SessionUsage {
  /** Tarifa copiada al empezar la sesión (REQ-001-14, REQ-001-16). */
  rateMicrosPerHour: Micros;
  /** Segundos pagados con horas de combo. */
  comboSecondsUsed: Seconds;
  /** Segundos pagados con el saldo en dinero. */
  moneySeconds: Seconds;
  /** `floor(moneySeconds × tarifa / 3600)`, siempre recalculado sobre el total. */
  moneyChargedMicros: Micros;
}

export interface CheckpointResult {
  usage: SessionUsage;
  /** Saldos en vivo: los de la cuenta menos lo consumido en la sesión. */
  live: AccountBalances;
}

/** Consumo de una sesión recién abierta con la tarifa dada. */
export function startUsage(rateMicrosPerHour: Micros): SessionUsage {
  if (rateMicrosPerHour <= 0) {
    throw new RangeError(`La tarifa debe ser mayor que cero: ${String(rateMicrosPerHour)}`);
  }
  return {
    rateMicrosPerHour,
    comboSecondsUsed: seconds(0),
    moneySeconds: seconds(0),
    moneyChargedMicros: micros(0),
  };
}

/** Importe de `moneySeconds` segundos a la tarifa dada, truncado al µUSD. */
export function chargeFor(moneySeconds: Seconds, rateMicrosPerHour: Micros): Micros {
  return micros(mulDivFloor(moneySeconds, rateMicrosPerHour, SECONDS_PER_HOUR));
}

/**
 * Segundos que se pueden pagar con un saldo en dinero: `floor(saldo × 3600 / tarifa)`
 * (REQ-001-11). Pagar esos segundos nunca cuesta más que el saldo.
 */
export function affordableSeconds(moneyMicros: Micros, rateMicrosPerHour: Micros): Seconds {
  if (moneyMicros <= 0) {
    return seconds(0);
  }
  return seconds(mulDivFloor(moneyMicros, SECONDS_PER_HOUR, rateMicrosPerHour));
}

/**
 * Saldos en vivo: los de la cuenta (la caché `customer_balances`, que ya incluye recargas
 * y compras hechas durante la sesión) menos lo consumido en la sesión en curso.
 */
export function liveBalances(usage: SessionUsage, balances: AccountBalances): AccountBalances {
  return {
    moneyMicros: micros(balances.moneyMicros - usage.moneyChargedMicros),
    comboSeconds: seconds(balances.comboSeconds - usage.comboSecondsUsed),
  };
}

/**
 * Aplica `elapsed` segundos de uso a la sesión (REQ-001-11, REQ-001-23, REQ-001-87).
 *
 * 1. Se gastan primero las horas de combo disponibles.
 * 2. El resto va al saldo en dinero, con tope en lo que el saldo puede pagar: el saldo
 *    nunca queda negativo y los segundos de más no se cobran (solo prepago).
 * 3. El importe se recalcula sobre el total de segundos en dinero.
 *
 * `elapsed` negativo (el reloj del nodo se corrigió hacia atrás) cuenta como 0. Los
 * contadores nunca bajan, aunque el saldo de la cuenta haya bajado durante la sesión.
 *
 * Quien llama debe avanzar su marca de tiempo exactamente `elapsed` segundos, no hasta
 * "ahora", para no perder las fracciones de segundo en cada latido.
 */
export function applyCheckpoint(
  usage: SessionUsage,
  balances: AccountBalances,
  elapsed: Seconds,
): CheckpointResult {
  const d = Math.max(0, elapsed);

  const comboAvailable = Math.max(0, balances.comboSeconds - usage.comboSecondsUsed);
  const fromCombo = Math.min(d, comboAvailable);
  const fromMoney = d - fromCombo;

  const moneyLimit = affordableSeconds(balances.moneyMicros, usage.rateMicrosPerHour);
  const moneySeconds = Math.max(
    usage.moneySeconds,
    Math.min(usage.moneySeconds + fromMoney, moneyLimit),
  );

  const next: SessionUsage = {
    rateMicrosPerHour: usage.rateMicrosPerHour,
    comboSecondsUsed: seconds(usage.comboSecondsUsed + fromCombo),
    moneySeconds: seconds(moneySeconds),
    moneyChargedMicros: chargeFor(seconds(moneySeconds), usage.rateMicrosPerHour),
  };
  return { usage: next, live: liveBalances(next, balances) };
}

/** `floor(a × b / c)` con enteros no negativos y `c` > 0, sin desbordar (BigInt). */
function mulDivFloor(a: number, b: number, c: number): number {
  return Number((BigInt(a) * BigInt(b)) / BigInt(c));
}
