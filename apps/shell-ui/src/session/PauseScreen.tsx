// Pantalla de pausa (T17, REQ-002-06, REQ-002-10): a pantalla completa, como en el diseño
// aprobado (T14). Muestra el tiempo de pausa que queda, las pausas que quedan y el saldo, que no
// cambia; si la pausa venció con la opción a), avisa de que el tiempo vuelve a correr
// (CA-002-05). «Reanudar» pregunta «¿Eres juan?» antes de quitar la pausa (CA-002-03).
//
// En la fase 1 es una pantalla del Shell y no bloquea el teclado del sistema; el escritorio
// separado llega con la spec 003 (REQ-002-04, ADR-0009).
import {
  formatBolivares,
  formatMoney,
  LOCAL_TIME_ZONE,
  type SessionState,
  type VesRate,
  type WarningMinutes,
} from '@pope/shared';
import { useState } from 'react';

import type { ChannelStatus } from '../channel/channel.js';
import { Wallpaper } from '../lock/Wallpaper.js';
import { formatTimeLeft, warningMinutes } from './format.js';
import { livePause, liveSession } from './live.js';
import { formatPauseLeft, type PauseResult, pauseMaxText } from './pause.js';
import { PauseIcon } from './PauseDialog.js';
import { useElapsed } from './use-elapsed.js';
import { WarningToast } from './WarningToast.js';

const CLOCK = new Intl.DateTimeFormat('es-VE', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: LOCAL_TIME_ZONE,
});

export function PauseScreen({
  session,
  vesRate,
  stateAt,
  status,
  pcName,
  warning,
  onCloseWarning,
  resume,
}: {
  session: Extract<SessionState, { kind: 'account' }>;
  vesRate: VesRate | null;
  stateAt: number;
  status: ChannelStatus;
  pcName: string;
  /** Aviso de fin de tiempo: solo puede llegar si la pausa ya cobra. */
  warning: WarningMinutes | null;
  onCloseWarning: () => void;
  resume: () => Promise<PauseResult>;
}) {
  const elapsed = useElapsed(stateAt);
  const live = liveSession(session, elapsed);
  const pause = livePause(session, elapsed);
  const [asking, setAsking] = useState(false);
  if (live.kind !== 'account' || pause === null) return null;
  const billing = pause.billing;
  const remaining = live.remainingSeconds;
  const until = CLOCK.format(new Date(Date.now() + pause.secondsLeft * 1000));
  const maxText = session.pauseMaxSeconds ? pauseMaxText(session.pauseMaxSeconds) : null;

  return (
    <div className="screen pause-screen">
      <Wallpaper blurred />
      <div className="pause-brand">POPE</div>

      <main className="screen-center pause-center">
        <section className="glass pause-card" aria-labelledby="t-pausa">
          {billing && (
            <div role="alert" className="pause-billing">
              <div className="pause-billing-icon">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="10" cy="10" r="7" />
                  <path d="M10 6v4.5l3 2" />
                </svg>
              </div>
              <div>
                <div className="pause-billing-title">Tu tiempo vuelve a correr</div>
                <div className="pause-billing-text">
                  {maxText === null
                    ? 'La pausa llegó a su máximo. Pulsa Reanudar para seguir jugando.'
                    : `La pausa llegó a los ${maxText}. Pulsa Reanudar para seguir jugando.`}
                </div>
              </div>
            </div>
          )}

          <div className="pause-icon">
            <PauseIcon size={38} />
          </div>
          <h1 id="t-pausa">Sesión en pausa</h1>

          <div className="pause-big">
            <div className="caps">{billing ? 'Tiempo restante' : 'Tiempo de pausa'}</div>
            <div role="timer" className={billing ? 'pause-time running' : 'pause-time'}>
              {billing ? formatTimeLeft(remaining) : formatPauseLeft(pause.secondsLeft)}
            </div>
            <div className="pause-sub">
              {billing ? 'Corre desde que acabó la pausa' : `Hasta las ${until}`}
            </div>
          </div>

          <div className="pause-facts">
            <div className="pause-fact">
              <div className="pause-fact-label">Pausas que quedan</div>
              <div className="pause-fact-value">{String(session.pausesLeft ?? 0)}</div>
            </div>
            <div className="pause-fact">
              <div className="pause-fact-label">{billing ? 'Pausa' : 'Tu tiempo · detenido'}</div>
              <div className="pause-fact-value">
                {billing ? 'Terminada' : formatTimeLeft(remaining)}
              </div>
            </div>
            <div className="pause-fact">
              <div className="pause-fact-label">Saldo</div>
              <div className="pause-fact-value">{formatMoney(live.moneyMicros)}</div>
              {vesRate !== null && (
                <div className="pause-fact-label">{formatBolivares(live.moneyMicros, vesRate)}</div>
              )}
            </div>
          </div>

          <button
            type="button"
            className="btn-primary pause-resume"
            onClick={() => {
              onCloseWarning();
              setAsking(true);
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 4.5v11l9-5.5z" />
            </svg>
            Reanudar
          </button>
        </section>
      </main>

      <footer className="session-footer pause-footer">
        <span className={status === 'online' ? 'dot dot-green' : 'dot dot-amber'} />
        {status === 'online'
          ? 'Conectado al servidor del local'
          : 'Sin conexión con el servidor del local · sigues en pausa'}
        <span className="session-spacer" />
        {pcName} · En pausa
      </footer>

      {warning !== null && billing && remaining > 0 && (
        <WarningToast
          minutesLeft={warningMinutes(warning, remaining)}
          temporary={false}
          onClose={onCloseWarning}
          onBuyCombo={null}
        />
      )}

      {asking && (
        <ResumeDialog
          username={session.username}
          resume={resume}
          onClose={() => {
            setAsking(false);
          }}
        />
      )}
    </div>
  );
}

/** «¿Eres juan?» (REQ-002-10, CA-002-03): la pausa solo se quita si confirma. */
function ResumeDialog({
  username,
  resume,
  onClose,
}: {
  username: string;
  resume: () => Promise<PauseResult>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const result = await resume();
    // Si reanudó, el nodo ya mandó el `state` sin pausa y esta pantalla desaparece.
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
        aria-labelledby="t-eres"
        className="dialog resume-dialog"
      >
        <div className="avatar resume-avatar">{username.slice(0, 2).toUpperCase()}</div>
        <h2 id="t-eres">¿Eres {username}?</h2>
        <p className="dialog-text">
          Al reanudar, el tiempo de {username} vuelve a correr. Si no eres {username}, avisa al
          encargado.
        </p>
        {error !== null && (
          <div role="alert" className="notice notice-error">
            {error}
          </div>
        )}
        <div className="dialog-actions resume-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy} autoFocus>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary btn-wide"
            onClick={() => {
              void confirm();
            }}
            disabled={busy}
          >
            {busy ? 'Reanudando…' : 'Sí, reanudar'}
          </button>
        </div>
      </div>
    </div>
  );
}
