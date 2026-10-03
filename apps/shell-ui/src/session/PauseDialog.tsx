// Confirmación antes de pausar (T16, REQ-002-02): avisa de que los juegos online pueden
// desconectarle y dice cuántas pausas le quedan. Como en el diseño aprobado (T14).
import { useState } from 'react';

import { type PauseResult, pauseMaxText, pausesLeftText } from './pause.js';

export function PauseDialog({
  pausesLeft,
  maxSeconds,
  pause,
  onClose,
}: {
  pausesLeft: number;
  /** Duración máxima de una pausa en el local; sin ella, la frase va sin minutos. */
  maxSeconds: number | null;
  pause: () => Promise<PauseResult>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const result = await pause();
    // Si pausó, el nodo ya mandó el `state` en pausa y esta pantalla desaparece.
    if (result.ok) {
      onClose();
    } else {
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
        aria-labelledby="t-pausar"
        className="dialog pausing"
      >
        <div className="dialog-head">
          <h2 id="t-pausar">¿Pausar tu sesión?</h2>
        </div>

        <p className="dialog-text">
          {maxSeconds === null
            ? 'Tu tiempo se detiene hasta que vuelvas. Si la pausa dura demasiado, el tiempo vuelve a correr.'
            : `Tu tiempo se detiene hasta que vuelvas. Puedes estar en pausa hasta ${pauseMaxText(maxSeconds)}; después, el tiempo vuelve a correr.`}
        </p>

        <div className="notice notice-warn pause-warn">
          <svg
            width="22"
            height="22"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 3 18 17H2z" />
            <path d="M10 8v4M10 14.5v.5" />
          </svg>
          <span>Los juegos online pueden desconectarte mientras estás en pausa.</span>
        </div>

        <div className="pauses-left">{pausesLeftText(pausesLeft)}</div>

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
            className="btn-primary btn-wide"
            onClick={() => {
              void confirm();
            }}
            disabled={busy}
          >
            <PauseIcon />
            {busy ? 'Pausando…' : 'Pausar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PauseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="4" width="3.5" height="12" rx="1" />
      <rect x="11.5" y="4" width="3.5" height="12" rx="1" />
    </svg>
  );
}
