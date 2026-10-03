// Reglas de la pausa de sesión (spec 002): cuántas pausas quedan, por qué no se puede pausar
// y cuánto dura una pausa. Sin efectos: el nodo decide con ellas y el Shell y el panel las
// muestran (ADR-0007).
import { z } from 'zod';

import { localDateInCaracas } from './exchange-rate.js';
import { type SessionKind, utcInstantSchema } from './session.js';
import type { Settings } from './settings.js';
import { type Seconds, seconds } from './time.js';

/**
 * La pausa en curso de una sesión, como la ven la PC (`state`) y el mapa del panel. `billing`
 * es `true` cuando venció con la opción a) y se vuelve a cobrar aunque la PC siga en la
 * pantalla de pausa (REQ-002-22, CA-002-05).
 */
export const sessionPauseSchema = z.object({
  startedAt: utcInstantSchema,
  /** Inicio más la duración máxima (REQ-002-20). */
  maxUntil: utcInstantSchema,
  billing: z.boolean(),
});
export type SessionPause = z.infer<typeof sessionPauseSchema>;

/**
 * Por qué no quedan pausas: se agotaron las de la sesión (REQ-002-21), las del día
 * (REQ-002-24), o la pausa está desactivada en el local (REQ-002-23). Con él el Shell elige
 * el mensaje del botón Pausar (mantenedor, 2026-10-03).
 */
export const pauseLimitSchema = z.enum(['session', 'day', 'disabled']);
export type PauseLimit = z.infer<typeof pauseLimitSchema>;

/** Los ajustes que cuentan para la pausa. */
export type PauseSettings = Pick<
  Settings,
  'pauseEnabled' | 'pauseMaxSeconds' | 'pauseMaxPerSession' | 'pauseMaxPerDay' | 'pauseOverrun'
>;

/** Pausas ya usadas por la cuenta, contando la que esté en curso. */
export const pausesUsedSchema = z.object({
  inSession: z.int().nonnegative(),
  /** En el día de Caracas, sumando todas sus sesiones (REQ-002-24). */
  today: z.int().nonnegative(),
});
export type PausesUsed = z.infer<typeof pausesUsedSchema>;

/** Pausas que quedan y, si no queda ninguna, por qué. */
export interface PauseAllowance {
  left: number;
  limit: PauseLimit | null;
}

/**
 * Pausas que le quedan a una sesión con cuenta: el mínimo entre las de la sesión y las del
 * día (REQ-002-21, REQ-002-24). Si se agotaron las dos a la vez manda el límite del día,
 * porque abrir otra sesión no daría pausas nuevas (mantenedor, 2026-10-03).
 */
export function pauseAllowance(settings: PauseSettings, used: PausesUsed): PauseAllowance {
  if (settings.pauseEnabled === 0) {
    return { left: 0, limit: 'disabled' };
  }
  const inSession = Math.max(0, settings.pauseMaxPerSession - used.inSession);
  const today = Math.max(0, settings.pauseMaxPerDay - used.today);
  if (today === 0) {
    return { left: 0, limit: 'day' };
  }
  if (inSession === 0) {
    return { left: 0, limit: 'session' };
  }
  return { left: Math.min(inSession, today), limit: null };
}

/** Por qué el nodo rechaza una petición de pausa. */
export type PauseRefusal = 'temporary' | 'already_paused' | PauseLimit;

/** Texto para el cliente de cada rechazo (spec 002; los tres primeros, mantenedor, 2026-10-03). */
export const PAUSE_REFUSAL_MESSAGES: Readonly<Record<PauseRefusal, string>> = {
  temporary: 'Las sesiones temporales no se pueden pausar',
  already_paused: 'Tu sesión ya está en pausa',
  disabled: 'La pausa no está disponible en este local',
  session: 'Sin pausas disponibles',
  day: 'Sin pausas disponibles hoy',
};

/**
 * Si una sesión puede pausar ahora, o por qué no: las temporales nunca (REQ-002-11), una ya
 * en pausa no vuelve a pausar, y una con cuenta necesita que le queden pausas. `null` si
 * puede.
 */
export function pauseRefusal(session: {
  kind: SessionKind;
  paused: boolean;
  allowance: PauseAllowance;
}): PauseRefusal | null {
  if (session.kind === 'temporary') {
    return 'temporary';
  }
  if (session.paused) {
    return 'already_paused';
  }
  return session.allowance.limit;
}

/**
 * Hasta cuándo dura una pausa (REQ-002-20): su inicio más la duración máxima vigente al
 * empezar. Se guarda con la pausa, así que cambiar el ajuste no afecta a las ya empezadas.
 */
export function pauseMaxUntil(
  startedAt: Date,
  settings: Pick<PauseSettings, 'pauseMaxSeconds'>,
): Date {
  return new Date(startedAt.getTime() + settings.pauseMaxSeconds * 1000);
}

/** Segundos de pausa que quedan en `now` (REQ-002-06, REQ-002-14); 0 si ya venció. */
export function pauseSecondsLeft(maxUntil: Date, now: Date): Seconds {
  return seconds(Math.max(0, Math.ceil((maxUntil.getTime() - now.getTime()) / 1000)));
}

/** La pausa llegó a su duración máxima (REQ-002-22): toca aplicar `pauseOverrun`. */
export function pauseExpired(maxUntil: Date, now: Date): boolean {
  return now.getTime() >= maxUntil.getTime();
}

/**
 * Cuántas de estas pausas empezaron el mismo día de Caracas que `now` (REQ-002-24). A las
 * 04:00 UTC cambia el día: una pausa de las 23:59 cuenta para el día anterior.
 */
export function pausesOnDayOf(startedAts: readonly Date[], now: Date): number {
  const today = localDateInCaracas(now);
  return startedAts.filter((startedAt) => localDateInCaracas(startedAt) === today).length;
}
