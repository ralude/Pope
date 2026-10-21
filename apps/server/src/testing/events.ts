/**
 * Eventos de la coordinación de las PCs (T28/T29). Cada cierre de sesión pide un bloqueo y
 * la PC lo confirma, así que siguen a `session.ended`; los tests de negocio los apartan.
 */
const PC_CONTROL_EVENTS = new Set([
  'pc.command_requested',
  'pc.command_acknowledged',
  'pc.command_expired',
  'pc.reservation_released',
]);

/** Los eventos sin los de coordinación de las PCs, en el mismo orden. */
export function withoutPcControl<T extends { type: string }>(events: T[]): T[] {
  return events.filter((event) => !PC_CONTROL_EVENTS.has(event.type));
}
