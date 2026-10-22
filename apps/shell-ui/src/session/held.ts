// Sesión retenida por una revocación de la PC (spec 003, T34h; REQ-003-11). El nodo conserva la
// sesión y su saldo, y la PC queda bloqueada y sin cobro hasta que el personal autorice continuar.
// El cliente no puede hacer nada: la pantalla solo lo tranquiliza.
import type { PcFeed } from '../channel/feed.js';

export const HELD_TITLE = 'PC bloqueada por el encargado';
export const HELD_TEXT =
  'Tu sesión y tu tiempo están a salvo. Avisa al encargado para seguir jugando.';

/** La PC está retenida: manda esta pantalla antes que la de bloqueo o la de sesión. */
export function isHeld(feed: PcFeed): boolean {
  return feed.state?.status === 'held';
}
