// Inicio de sesión del personal (REQ-001-40), como en el diseño: tarjeta centrada y, abajo,
// si el panel llega al nodo local.
import { type SyntheticEvent, useEffect, useState } from 'react';

import { ApiError, NETWORK_ERROR } from '../api/client.js';
import { useSession } from '../session.js';

type NodeStatus = 'checking' | 'up' | 'down';

/** ¿Responde el nodo? Se pregunta una vez al abrir la pantalla. */
function useNodeStatus(): NodeStatus {
  const [status, setStatus] = useState<NodeStatus>('checking');
  useEffect(() => {
    let cancelled = false;
    fetch('/health').then(
      (response) => {
        if (!cancelled) setStatus(response.ok ? 'up' : 'down');
      },
      () => {
        if (!cancelled) setStatus('down');
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}

export function LoginPage({ notice }: { notice: string | null }) {
  const { login } = useSession();
  const node = useNodeStatus();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(notice);
  const [busy, setBusy] = useState(false);

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : NETWORK_ERROR);
      setPassword('');
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">POPE</div>
      </header>
      <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <form
          className="card"
          onSubmit={(event) => {
            void submit(event);
          }}
          style={{ width: 420, padding: 36, display: 'flex', flexDirection: 'column', gap: 20 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 400 }}>Panel del local</h1>
            <span className="muted">Entra con tu usuario del personal.</span>
          </div>
          {error && (
            <div className="alert-error" role="alert">
              {error}
            </div>
          )}
          <div className="field">
            <label className="label" htmlFor="usuario">
              Usuario
            </label>
            <input
              id="usuario"
              className="input"
              type="text"
              autoComplete="username"
              autoFocus
              required
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
              }}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="clave">
              Contraseña
            </label>
            <input
              id="clave"
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? 'Entrando…' : 'Iniciar sesión'}
          </button>
          <span className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
            Cada encargado tiene su propio usuario. Si no tienes uno, pídeselo al administrador.
          </span>
        </form>
      </div>
      <footer
        className="muted"
        style={{
          height: 36,
          padding: '0 20px',
          borderTop: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
        }}
      >
        <span
          className="status-dot"
          style={{
            background:
              node === 'up' ? 'var(--green-bar)' : node === 'down' ? 'var(--red)' : 'var(--line-2)',
          }}
        />
        {node === 'up' && 'Conectado al nodo local · funciona sin internet'}
        {node === 'down' && 'Sin conexión con el nodo local'}
        {node === 'checking' && 'Comprobando la conexión con el nodo local…'}
      </footer>
    </div>
  );
}
