// Sesión abierta (T47): tiempo total, horas de combo y saldo con su tiempo equivalente, en
// vivo (REQ-001-12, REQ-001-13, REQ-001-88). Como en el diseño "Shell Pope · Fase 9", pero
// sin el catálogo de apps, que llegará con la spec 004 (decisión del mantenedor).
import {
  formatBolivares,
  formatMoney,
  LOCAL_TIME_ZONE,
  type SessionState,
  type VesRate,
  type WarningMinutes,
} from '@pope/shared';
import { useEffect, useState } from 'react';

import type { ChannelStatus } from '../channel/channel.js';
import { Wallpaper } from '../lock/Wallpaper.js';
import { ComboDialog } from './ComboDialog.js';
import type { BuyResult, CombosResult } from './combos.js';
import { formatTimeLeft, warningMinutes } from './format.js';
import { liveSession } from './live.js';
import { WarningToast } from './WarningToast.js';

/** Por debajo de 5 min el tiempo se pinta en ámbar, como los avisos (REQ-001-24). */
const LOW_SECONDS = 300;

const CLOCK = new Intl.DateTimeFormat('es-VE', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: LOCAL_TIME_ZONE,
});

/** Segundos desde `since` (`performance.now()`), refrescados cada segundo. */
function useElapsed(since: number): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    setNow(performance.now());
    const timer = setInterval(() => {
      setNow(performance.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [since]);
  return Math.max(0, (now - since) / 1000);
}

/** Aviso breve de confirmación ("Listo: sumaste…"), que se quita solo a los 4 s. */
function useNotice(): { text: string | null; show: (text: string) => void } {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (text === null) return;
    const timer = setTimeout(() => {
      setText(null);
    }, 4000);
    return () => {
      clearTimeout(timer);
    };
  }, [text]);
  return { text, show: setText };
}

export function SessionScreen({
  session,
  vesRate,
  stateAt,
  status,
  pcName,
  warning,
  onCloseWarning,
  listCombos,
  buyCombo,
}: {
  session: SessionState;
  vesRate: VesRate | null;
  stateAt: number;
  status: ChannelStatus;
  pcName: string;
  /** Aviso de fin de tiempo que mandó el nodo (T48), si hay uno abierto. */
  warning: WarningMinutes | null;
  onCloseWarning: () => void;
  listCombos: () => Promise<CombosResult>;
  buyCombo: (comboId: string) => Promise<BuyResult>;
}) {
  const live = liveSession(session, useElapsed(stateAt));
  const remaining = live.remainingSeconds;
  const endsAt = CLOCK.format(new Date(Date.now() + remaining * 1000));
  const who = session.kind === 'account' ? session.username : session.name;
  const [buying, setBuying] = useState(false);
  const notice = useNotice();

  const openCombos = () => {
    onCloseWarning();
    setBuying(true);
  };

  return (
    <div className="screen session">
      <Wallpaper blurred />

      <header className="session-bar">
        <div className="session-brand">POPE</div>
        <div className="session-spacer" />
        <div className="pc-pill">
          <span className="dot dot-green" />
          {pcName} · En uso
        </div>
        <button
          type="button"
          className="icon-btn"
          disabled
          aria-label="Pausar la sesión (próximamente)"
          title="Pausa: próximamente"
        >
          <svg
            width="20"
            height="20"
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
        </button>
      </header>

      <div className="session-body">
        <div className="session-main" />

        <aside className="glass session-panel" aria-label="Tu sesión">
          <div className="who">
            <div className="avatar">{who.slice(0, 2).toUpperCase()}</div>
            <div className="who-text">
              <div className="who-name">{who}</div>
              <div className="who-sub">
                {session.kind === 'account' ? 'Tu cuenta' : 'Sesión temporal'}
              </div>
            </div>
          </div>

          <div className="separator" />

          <div className="remaining">
            <div className="caps">Tiempo restante</div>
            <div
              role="timer"
              className={remaining <= LOW_SECONDS ? 'remaining-time low' : 'remaining-time'}
            >
              {formatTimeLeft(remaining)}
            </div>
            <div className="remaining-until">
              {remaining > 0 ? `Hasta las ${endsAt} aprox.` : 'Sin tiempo'}
            </div>
          </div>

          {live.kind === 'account' && session.kind === 'account' && (
            <>
              <div className="balances">
                <div className={live.comboSeconds > 0 ? 'balance active' : 'balance'}>
                  <div className="balance-icon">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="3" y="5" width="14" height="10" rx="2" />
                      <path d="M3 9h14M7 12.5h3" />
                    </svg>
                  </div>
                  <div className="balance-text">
                    <div className="balance-name">Horas de combo</div>
                    <div className="balance-sub">
                      {live.consuming === 'combo' && <span className="in-use">En uso</span>}
                      Se gastan primero
                    </div>
                  </div>
                  <div className="balance-value">{formatTimeLeft(live.comboSeconds)}</div>
                </div>

                <div className={live.comboSeconds > 0 ? 'balance' : 'balance active'}>
                  <div className="balance-icon">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="2.5" y="5" width="15" height="11" rx="2" />
                      <path d="M2.5 8.5h15M13 12.5h2" />
                    </svg>
                  </div>
                  <div className="balance-text">
                    <div className="balance-name">Saldo</div>
                    <div className="balance-sub">
                      {live.consuming === 'money' && <span className="in-use">En uso</span>}≈{' '}
                      {formatTimeLeft(live.moneySeconds)} de uso
                    </div>
                  </div>
                  <div className="balance-values">
                    <div className="balance-value">{formatMoney(live.moneyMicros)}</div>
                    {vesRate !== null && (
                      <div className="balance-sub">
                        {formatBolivares(live.moneyMicros, vesRate)}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rate">
                Tarifa de la sesión: {formatMoney(session.ratePerHour.micros, { suffix: '/h' })}
                {vesRate !== null &&
                  ` (${formatBolivares(session.ratePerHour.micros, vesRate, '/h')})`}
              </div>

              <div className="buy">
                <button type="button" className="btn-primary" onClick={openCombos}>
                  Comprar combo
                </button>
                <div className="buy-hint">Para recargar saldo, acércate al mostrador.</div>
              </div>
            </>
          )}

          {session.kind === 'temporary' && (
            <div className="note">
              Sesión abierta por el encargado: no usa saldo ni combos. Para añadir tiempo, habla con
              el mostrador.
            </div>
          )}
        </aside>
      </div>

      <footer className="session-footer">
        <span className={status === 'online' ? 'dot dot-green' : 'dot dot-amber'} />
        {status === 'online'
          ? 'Conectado al servidor del local'
          : 'Sin conexión con el servidor del local · el tiempo sigue contando'}
      </footer>

      {warning !== null && remaining > 0 && (
        <WarningToast
          minutesLeft={warningMinutes(warning, remaining)}
          temporary={session.kind === 'temporary'}
          onClose={onCloseWarning}
          onBuyCombo={session.kind === 'account' ? openCombos : null}
        />
      )}

      {notice.text !== null && (
        <div role="status" className="toast toast-ok">
          <div className="toast-icon">
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4.5 10.5l3.5 3.5 7.5-8" />
            </svg>
          </div>
          <div className="toast-title">{notice.text}</div>
        </div>
      )}

      {buying && live.kind === 'account' && (
        <ComboDialog
          moneyMicros={live.moneyMicros}
          comboSeconds={live.comboSeconds}
          vesRate={vesRate}
          listCombos={listCombos}
          buyCombo={buyCombo}
          onClose={() => {
            setBuying(false);
          }}
          onBought={(text) => {
            setBuying(false);
            notice.show(text);
          }}
        />
      )}
    </div>
  );
}
