// Estado que ve la PC a partir de la fila de `sessions` (REQ-001-12, REQ-001-88).
import {
  type AccountBalances,
  type Actor,
  affordableSeconds,
  type CustomerBalances,
  type CustomerStatus,
  liveBalances,
  micros,
  type NodeToPcMessage,
  type ProtocolErrorCode,
  seconds,
  secondsUntilExhausted,
  type SessionPause,
  type SessionUsage,
  type TemporaryUsage,
  type VesRate,
  temporaryRemaining,
} from '@pope/shared';

import type { sessionPauses, sessions } from '../db/schema.js';

export type SessionRow = typeof sessions.$inferSelect;
export type PauseRow = typeof sessionPauses.$inferSelect;

/**
 * La pausa ya cobra: venció con la opción a) y se volvió a cobrar desde `max_until`
 * (REQ-002-22). Mientras no cobra, el tiempo de la sesión no corre (REQ-002-03).
 */
export function pauseBilling(pause: PauseRow): boolean {
  return pause.billingResumedAt !== null;
}

/** La pausa tal como la ven la PC y el panel (REQ-002-06, REQ-002-14). */
export function pauseView(pause: PauseRow | null): SessionPause | null {
  return pause
    ? {
        startedAt: pause.startedAt.toISOString(),
        maxUntil: pause.maxUntil.toISOString(),
        billing: pauseBilling(pause),
      }
    : null;
}

/** Petición de la PC rechazada con un código del protocolo y un mensaje en español. */
export class PcRequestRefused extends Error {
  constructor(
    readonly code: ProtocolErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Texto para el cliente cuando su cuenta está bloqueada o desactivada (pregunta resuelta de
 * la spec 001, REQ-001-04). El del personal es `inactiveAccountMessage`.
 */
export function customerInactiveMessage(status: Exclude<CustomerStatus, 'active'>): string {
  return `Tu cuenta está ${status === 'blocked' ? 'bloqueada' : 'desactivada'}. Habla con el encargado`;
}

/** Nombre de quien hizo algo, para mostrarlo en el panel. */
export function actorName(actor: Actor): string {
  switch (actor.kind) {
    case 'staff':
      return actor.name;
    case 'customer':
      return actor.username;
    case 'system':
      return 'Sistema';
  }
}

/** Consumo de una sesión con cuenta según su fila. */
export function usageOf(row: SessionRow): SessionUsage {
  return {
    rateMicrosPerHour: micros(row.rateMicrosPerHour),
    comboSecondsUsed: seconds(row.comboSecondsUsed),
    moneySeconds: seconds(row.moneySeconds),
    moneyChargedMicros: micros(row.moneyChargedMicros),
  };
}

/** Tiempo de una sesión temporal según su fila. */
export function temporaryUsageOf(row: SessionRow): TemporaryUsage {
  return {
    purchasedSeconds: seconds(row.purchasedSeconds ?? 0),
    usedSeconds: seconds(row.usedSeconds),
  };
}

/** Saldos de la caché en el formato del motor de cobro. */
export function accountBalances(balances: CustomerBalances): AccountBalances {
  return { moneyMicros: balances.moneyMicros, comboSeconds: seconds(balances.comboSeconds) };
}

/** Segundos que le quedan a una sesión, sea con cuenta o temporal. */
export function remainingSeconds(row: SessionRow, balances: CustomerBalances | null): number {
  return row.kind === 'account' && balances
    ? secondsUntilExhausted(usageOf(row), accountBalances(balances))
    : temporaryRemaining(temporaryUsageOf(row));
}

/**
 * `state` de una PC en sesión. Con cuenta: combo, saldo en dinero con su tiempo a la
 * tarifa de la sesión, y total (REQ-001-11, REQ-001-88). Temporal: comprado y restante.
 */
export function activeState(
  row: SessionRow,
  account: { username: string; balances: CustomerBalances } | null,
  /** Tasa vigente, para que el Shell muestre el Bs (REQ-005-36); `null` si no hay. */
  vesRate: VesRate | null,
  /** La pausa abierta de una sesión con cuenta, o `null` (REQ-002-06). */
  pause: PauseRow | null,
): NodeToPcMessage {
  const base = { sessionId: row.id, startedAt: row.startedAt.toISOString() };
  if (row.kind === 'account' && account) {
    const usage = usageOf(row);
    const live = liveBalances(usage, accountBalances(account.balances));
    const moneySeconds = affordableSeconds(live.moneyMicros, usage.rateMicrosPerHour);
    return {
      type: 'state',
      status: 'active',
      vesRate,
      session: {
        kind: 'account',
        ...base,
        username: account.username,
        ratePerHour: { micros: usage.rateMicrosPerHour, currency: 'USD' },
        comboSeconds: seconds(Math.max(0, live.comboSeconds)),
        money: { micros: micros(Math.max(0, live.moneyMicros)), currency: 'USD' },
        moneySeconds,
        remainingSeconds: seconds(Math.max(0, live.comboSeconds) + moneySeconds),
        pause: pauseView(pause),
      },
    };
  }
  const usage = temporaryUsageOf(row);
  return {
    type: 'state',
    status: 'active',
    vesRate,
    session: {
      kind: 'temporary',
      ...base,
      name: row.tempName ?? '',
      purchasedSeconds: usage.purchasedSeconds,
      remainingSeconds: temporaryRemaining(usage),
    },
  };
}

export const LOCKED_STATE: NodeToPcMessage = { type: 'state', status: 'locked' };
