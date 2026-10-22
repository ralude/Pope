// Formulario «Usuario técnico» de la pantalla de bloqueo (spec 003, T38a; REQ-003-40). Usuario
// y contraseña del personal; el nodo valida y la PC prepara Windows. Aquí no se pide ni se
// guarda ninguna contraseña de Windows.
import { type SyntheticEvent, useEffect, useRef, useState } from 'react';

import {
  missingTechnicalField,
  TECHNICAL_AUTHORIZED_MESSAGE,
  type TechnicalResult,
} from './technical.js';

export function TechnicalLogin({
  online,
  technicalLogin,
  onCancel,
}: {
  online: boolean;
  technicalLogin: (username: string, password: string) => Promise<TechnicalResult>;
  onCancel: () => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Autorizado: el nodo y la PC confirmaron la entrada; solo queda esperar a Windows.
  const [authorized, setAuthorized] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (online) usernameRef.current?.focus();
  }, [online]);

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    const missing = missingTechnicalField(username, password);
    if (missing) {
      setError(missing);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await technicalLogin(username, password);
    // La contraseña no se conserva ni al acertar ni al fallar.
    setPassword('');
    if (result.ok) {
      setAuthorized(true);
      return;
    }
    setError(result.message);
    setBusy(false);
    passwordRef.current?.focus();
  }

  const disabled = !online || busy || authorized;

  return (
    <form
      className="glass login-card"
      aria-labelledby="t-technical"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <div className="login-head">
        <h1 id="t-technical">Usuario técnico</h1>
      </div>

      {error && online && (
        <div role="alert" className="notice notice-error">
          {error}
        </div>
      )}
      {authorized && (
        <div role="status" className="notice notice-warn">
          {TECHNICAL_AUTHORIZED_MESSAGE}
        </div>
      )}
      {!online && (
        <div role="status" className="notice notice-warn">
          No se puede entrar sin el servidor del local. Reintentando…
        </div>
      )}

      <div className="field">
        <label htmlFor="tecnico-usuario">Usuario del personal</label>
        <input
          id="tecnico-usuario"
          ref={usernameRef}
          className="input"
          type="text"
          autoComplete="off"
          placeholder="Tu usuario"
          value={username}
          disabled={disabled}
          onChange={(event) => {
            setUsername(event.target.value);
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="tecnico-clave">Contraseña</label>
        <input
          id="tecnico-clave"
          ref={passwordRef}
          className="input"
          type="password"
          autoComplete="off"
          placeholder="Tu contraseña"
          value={password}
          disabled={disabled}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
      </div>

      <button type="submit" className="btn-primary" disabled={disabled}>
        {authorized ? 'Abriendo Windows…' : busy ? 'Comprobando…' : 'Entrar'}
      </button>
      {!authorized && (
        <button type="button" className="link-button" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      )}
    </form>
  );
}
