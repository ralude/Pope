// Tiempo para el cliente, sin segundos: «4 h 15 min», «45 min» (decisión del mantenedor). Se
// redondea hacia arriba, así nunca se ve «0 min» mientras quede tiempo.
import { SECONDS_PER_HOUR, SECONDS_PER_MINUTE, type WarningMinutes } from '@pope/shared';

/**
 * Minutos que dice el aviso de fin de tiempo (T48): los del nodo, pero nunca más de los que
 * quedan de verdad. Si el nodo se reinicia, vuelve a mandar el de 5 min aunque ya queden 3;
 * así el aviso no contradice al contador.
 */
export function warningMinutes(warning: WarningMinutes, remainingSeconds: number): number {
  return Math.min(warning, Math.max(1, Math.ceil(remainingSeconds / SECONDS_PER_MINUTE)));
}

export function formatTimeLeft(seconds: number): string {
  const totalMinutes = Math.ceil(Math.max(0, seconds) / SECONDS_PER_MINUTE);
  const hours = Math.floor(totalMinutes / (SECONDS_PER_HOUR / SECONDS_PER_MINUTE));
  const minutes = totalMinutes % (SECONDS_PER_HOUR / SECONDS_PER_MINUTE);
  if (hours === 0) return `${String(minutes)} min`;
  if (minutes === 0) return `${String(hours)} h`;
  return `${String(hours)} h ${String(minutes)} min`;
}
