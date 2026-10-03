// Cuenta atrás local entre cada `state` del nodo (T47, REQ-001-12, REQ-001-88). El nodo cobra
// con su reloj (ADR-0007) y manda el estado en cada latido; entre medias el Shell descuenta
// los segundos pasados con el mismo motor de cobro de `@pope/shared`, así lo que se ve
// coincide con lo que cobrará el nodo.
import {
  affordableSeconds,
  applyCheckpoint,
  type Micros,
  type SessionState,
  type Seconds,
  seconds,
  startUsage,
} from '@pope/shared';

/** Lo que se gasta ahora: primero el combo y después el saldo (REQ-001-87). */
export type Consuming = 'combo' | 'money' | null;

export type LiveSession =
  | {
      kind: 'account';
      remainingSeconds: Seconds;
      comboSeconds: Seconds;
      moneyMicros: Micros;
      /** Tiempo que paga el saldo a la tarifa de la sesión (REQ-001-11). */
      moneySeconds: Seconds;
      consuming: Consuming;
    }
  | { kind: 'temporary'; remainingSeconds: Seconds };

/**
 * La sesión está en una pausa que aún no cobra: su tiempo no corre (REQ-002-03). Si venció con
 * la opción a), ya cobra aunque siga en pausa (CA-002-05).
 */
export function onHold(session: SessionState): boolean {
  return session.kind === 'account' && session.pause != null && !session.pause.billing;
}

/**
 * La pausa `elapsed` segundos después de recibir el `state` (REQ-002-06): los segundos de pausa
 * que quedan, descontados desde los que dio el nodo, y si ya cobra. `null` sin pausa.
 */
export function livePause(
  session: SessionState,
  elapsed: number,
): { secondsLeft: Seconds; billing: boolean } | null {
  if (session.kind !== 'account' || !session.pause) return null;
  const spent = Math.max(0, Math.floor(elapsed));
  return {
    secondsLeft: seconds(Math.max(0, session.pause.secondsLeft - spent)),
    billing: session.pause.billing,
  };
}

/** El estado de la sesión `elapsed` segundos después de recibirlo. */
export function liveSession(session: SessionState, elapsed: number): LiveSession {
  // En una pausa que no cobra, el tiempo de la sesión está detenido.
  const spent = seconds(onHold(session) ? 0 : Math.max(0, Math.floor(elapsed)));
  if (session.kind === 'temporary') {
    return {
      kind: 'temporary',
      remainingSeconds: seconds(Math.max(0, session.remainingSeconds - spent)),
    };
  }
  const rate = session.ratePerHour.micros;
  const { live } = applyCheckpoint(
    startUsage(rate),
    { moneyMicros: session.money.micros, comboSeconds: session.comboSeconds },
    spent,
  );
  const comboSeconds = seconds(Math.max(0, live.comboSeconds));
  const moneySeconds = affordableSeconds(live.moneyMicros, rate);
  return {
    kind: 'account',
    comboSeconds,
    moneyMicros: live.moneyMicros,
    moneySeconds,
    remainingSeconds: seconds(comboSeconds + moneySeconds),
    consuming: comboSeconds > 0 ? 'combo' : moneySeconds > 0 ? 'money' : null,
  };
}
