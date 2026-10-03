// Lógica de Interrumpidas (T45), sin React: los textos del respaldo, la hora de un corte y
// las PCs donde se puede restaurar.
import {
  formatLocalTime,
  LOCAL_TIME_ZONE,
  type PcMapItem,
  type TemporarySession,
} from '@pope/shared';

import { minutesLabel } from '../temporary/model.js';

const localDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: LOCAL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const WEEKDAY_SHORT: Record<string, string> = {
  Mon: 'lun',
  Tue: 'mar',
  Wed: 'mié',
  Thu: 'jue',
  Fri: 'vie',
  Sat: 'sáb',
  Sun: 'dom',
};

const localWeekday = new Intl.DateTimeFormat('en-US', {
  timeZone: LOCAL_TIME_ZONE,
  weekday: 'short',
});

/** Hora del local; si no es de hoy, con el día delante: «18:20» o «lun 21:10». */
export function formatLocalMoment(instant: Date, now: Date): string {
  const time = formatLocalTime(instant);
  if (localDay.format(instant) === localDay.format(now)) return time;
  return `${WEEKDAY_SHORT[localWeekday.format(instant)] ?? ''} ${time}`.trim();
}

/** Tiempo que le quedaba: «40 min», «1 h 05 min». */
export function remainingText(seconds: number): string {
  return seconds < 60 ? 'menos de 1 min' : minutesLabel(Math.floor(seconds / 60));
}

/**
 * Motivo de cierre en el respaldo (REQ-001-64, REQ-001-31), con el estado de la
 * restauración si la cerró un corte con tiempo restante.
 */
export function reasonText(session: TemporarySession, now: Date): string {
  if (session.status === 'active') return 'En curso';
  const interruption = session.interruption;
  if (interruption) {
    if (interruption.restoredBy) {
      const at = formatLocalMoment(new Date(interruption.restoredBy.at), now);
      return `Restaurada por ${interruption.restoredBy.name} a las ${at}`;
    }
    return interruption.status === 'expired' ? 'Sin latidos · caducada' : 'Sin latidos · pendiente';
  }
  switch (session.endReason) {
    case 'customer':
      return 'La cerró el cliente';
    case 'staff':
      return 'La cerró el encargado';
    case 'exhausted':
      return 'Se agotó el tiempo';
    case 'no_heartbeat':
      return 'Sin latidos';
    // Las temporales no pausan (REQ-002-11), pero el motivo existe para las de cuenta.
    case 'pause_expired':
      return 'Se venció la pausa';
    case null:
      return '—';
  }
}

/** PCs donde se puede restaurar: conectadas y sin sesión, por nombre (REQ-001-67). */
export function restoreTargets(pcs: readonly PcMapItem[]): PcMapItem[] {
  return pcs
    .filter((pc) => pc.connected && pc.session === null)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** PCs con sesiones en el respaldo, por nombre, para elegir cuál ver. */
export function backupPcs(sessions: readonly TemporarySession[]): { id: string; name: string }[] {
  const byId = new Map(sessions.map((s) => [s.pc.id, s.pc]));
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
