// Confirmación antes de cerrar la sesión (T50, REQ-001-26). En una temporal avisa de que el
// tiempo que queda se pierde: «Perderás X min» (REQ-001-69, CA-001-09).
import { useState } from 'react';

import { formatTimeLeft } from './format.js';
import type { LogoutResult } from './logout.js';

export function LogoutDialog({
  temporary,
  remainingSeconds,
  balances,
  logout,
  onClose,
}: {
  temporary: boolean;
  remainingSeconds: number;
  /** Con cuenta: saldo y horas de combo que quedan guardados, ya formateados. */
  balances: { money: string; combo: string } | null;
  logout: () => Promise<LogoutResult>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lost = formatTimeLeft(remainingSeconds);

  async function confirm() {
    setBusy(true);
    setError(null);
    const result = await logout();
    // Si cerró, el nodo ya mandó el fin de la sesión y esta pantalla desaparece.
    if (!result.ok) {
      setError(result.message);
      setBusy(false);
    }
  }

  return (
    <div
      className="dialog-backdrop"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) onClose();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="t-logout"
        className="dialog logout"
      >
        <div className="dialog-head">
          <h2 id="t-logout">¿Cerrar sesión?</h2>
        </div>

        {temporary ? (
          <div className="lose">
            <div className="lose-title">Perderás {lost}</div>
            <div>El tiempo que te queda no se devuelve ni se puede recuperar.</div>
          </div>
        ) : (
          <p className="dialog-text">
            {balances
              ? `Tu saldo (${balances.money}) y tus horas de combo (${balances.combo}) quedan guardados para la próxima vez, en cualquier PC.`
              : 'Tu saldo y tus horas de combo quedan guardados para la próxima vez.'}
          </p>
        )}

        {error !== null && (
          <div role="alert" className="notice notice-error">
            {error}
          </div>
        )}

        <div className="dialog-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy} autoFocus>
            Seguir jugando
          </button>
          <button
            type="button"
            className={temporary ? 'btn-danger' : 'btn-primary btn-wide'}
            onClick={() => {
              void confirm();
            }}
            disabled={busy}
          >
            {busy ? 'Cerrando…' : temporary ? `Cerrar y perder ${lost}` : 'Cerrar sesión'}
          </button>
        </div>
      </div>
    </div>
  );
}
