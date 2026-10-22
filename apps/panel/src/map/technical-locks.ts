// Avisos de bloqueo del login técnico (spec 003, T42b; REQ-003-45, CA-003-10), sin React. El
// nodo envía un aviso por bloqueo, a los paneles conectados y a los que se conectan mientras
// dura el minuto; aquí se acumulan sin duplicarlos y se quitan al cumplirse `lockedUntil`.
import { formatLocalTime, type PanelMessage } from '@pope/shared';

export type TechnicalLock = Extract<PanelMessage, { type: 'technicalLoginLocked' }>;

/** Un bloqueo se identifica por su cuenta y su fin: el mismo aviso recibido dos veces es uno. */
export const lockKey = (lock: TechnicalLock): string => `${lock.username}|${lock.lockedUntil}`;

/** Añade el aviso si no estaba ya. */
export function addLock(locks: readonly TechnicalLock[], lock: TechnicalLock): TechnicalLock[] {
  return locks.some((known) => lockKey(known) === lockKey(lock)) ? [...locks] : [...locks, lock];
}

/** Los avisos que siguen vigentes y que el encargado no ha cerrado. */
export function visibleLocks(
  locks: readonly TechnicalLock[],
  dismissed: ReadonlySet<string>,
  now: Date,
): TechnicalLock[] {
  return locks.filter(
    (lock) => Date.parse(lock.lockedUntil) > now.getTime() && !dismissed.has(lockKey(lock)),
  );
}

/** Quita los ya vencidos, para que la lista no crezca durante semanas sin recargar. */
export function pruneLocks(locks: readonly TechnicalLock[], now: Date): TechnicalLock[] {
  return locks.filter((lock) => Date.parse(lock.lockedUntil) > now.getTime());
}

/** El texto del aviso; nunca lleva contraseñas, solo la cuenta, la PC y la hora. */
export function lockText(lock: TechnicalLock): string {
  return `Login técnico bloqueado: ${lock.staffName} falló 10 veces en la ${lock.pc.name}. Podrá volver a intentarlo a las ${formatLocalTime(new Date(lock.lockedUntil))}.`;
}
