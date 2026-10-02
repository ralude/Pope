// Pantalla de bloqueo con el login del cliente (REQ-001-20, REQ-001-52), como en el diseño
// "Shell Pope · Fase 9": tarjetas de vidrio a la izquierda, reloj a la derecha y, abajo, si
// la PC llega al nodo. Sin nodo no se puede entrar (REQ-003-04).
import { type SyntheticEvent, useEffect, useRef, useState } from 'react';

import type { PcFeed } from '../channel/use-pc-channel.js';
import { type LoginResult, missingField } from './login.js';
import { Wallpaper } from './Wallpaper.js';

// La hora del local, aunque el reloj de Windows de la PC esté en otra zona.
const TIME = new Intl.DateTimeFormat('es-VE', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/Caracas',
});
const DATE = new Intl.DateTimeFormat('es-VE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'America/Caracas',
});

const FOOTER: Record<PcFeed['status'], string> = {
  connecting: 'Conectando con el servidor del local…',
  online: 'Conectado al servidor del local',
  offline: 'Sin conexión con el servidor del local · reintentando',
};

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return (
    <div className="lock-clock">
      <div className="lock-time">{TIME.format(now)}</div>
      <div className="lock-date">{DATE.format(now)}</div>
    </div>
  );
}

export function LockScreen({
  feed,
  pcName,
  login,
}: {
  feed: PcFeed;
  pcName: string;
  login: (username: string, password: string) => Promise<LoginResult>;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const online = feed.status === 'online';

  // Los campos están desactivados hasta que contesta el nodo: el foco va al usuario entonces.
  useEffect(() => {
    if (online) usernameRef.current?.focus();
  }, [online]);
  const offlineText =
    feed.problem ??
    (feed.status === 'connecting'
      ? 'Conectando con el servidor del local…'
      : 'No se puede iniciar sesión sin el servidor del local. Reintentando…');

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    const missing = missingField(username, password);
    if (missing) {
      setError(missing);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await login(username, password);
    // Si entró, el nodo ya mandó la sesión y esta pantalla desaparece.
    if (!result.ok) {
      setError(result.message);
      setPassword('');
      setBusy(false);
      passwordRef.current?.focus();
    }
  }

  return (
    <div className="screen">
      <Wallpaper />
      <div className="lock-brand">POPE</div>
      <Clock />

      <main className="lock-column">
        <section className="glass pc-card" aria-label="Esta PC">
          <div className="pc-name">{pcName}</div>
          {online ? (
            <div className="pc-status pc-status-free">
              <span className="dot dot-green" />
              Disponible
            </div>
          ) : (
            <div className="pc-status pc-status-off">
              <span className="dot dot-amber" />
              Sin conexión con el servidor
            </div>
          )}
        </section>

        <form
          className="glass login-card"
          aria-labelledby="t-login"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <div className="login-head">
            <div className="login-icon">
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
                <circle cx="10" cy="7" r="3.5" />
                <path d="M3.5 17c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5" />
              </svg>
            </div>
            <h1 id="t-login">Iniciar sesión</h1>
          </div>

          {error && online && (
            <div role="alert" className="notice notice-error">
              {error}
            </div>
          )}
          {!online && (
            <div role="status" className="notice notice-warn">
              {offlineText}
            </div>
          )}

          <div className="field">
            <label htmlFor="usuario">Usuario</label>
            <input
              id="usuario"
              ref={usernameRef}
              className="input"
              type="text"
              autoComplete="username"
              placeholder="Tu usuario"
              value={username}
              disabled={!online || busy}
              onChange={(event) => {
                setUsername(event.target.value);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="clave">Contraseña</label>
            <input
              id="clave"
              ref={passwordRef}
              className="input"
              type="password"
              autoComplete="current-password"
              placeholder="Tu contraseña"
              value={password}
              disabled={!online || busy}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={!online || busy}>
            {!online ? 'Esperando al servidor…' : busy ? 'Entrando…' : 'Entrar'}
          </button>
          <p className="login-help">
            ¿No tienes cuenta? Pídela en el mostrador. Tu saldo y tus horas de combo te esperan en
            cualquier PC.
          </p>
        </form>
      </main>

      <footer className="lock-footer">
        <span className={online ? 'dot dot-green' : 'dot dot-amber'} />
        {FOOTER[feed.status]}
      </footer>
    </div>
  );
}
