// Ajustes del local (spec 005, T23b), solo para el administrador: el nombre del local, que va
// en el reporte del cierre (REQ-005-51), y si se puede vender sin stock (REQ-005-12).
import { type Settings, settingsSchema } from '@pope/shared';
import { type SyntheticEvent, useEffect, useState } from 'react';

import { ApiError } from '../api/client.js';
import { useSession } from '../session.js';
import { Frame } from '../ui/Frame.js';

function errorMessage(failure: unknown): string {
  return failure instanceof ApiError ? failure.message : String(failure);
}

export function SettingsPage() {
  const { api } = useSession();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [name, setName] = useState('');
  const [allowNegative, setAllowNegative] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/settings', settingsSchema).then(
      (loaded) => {
        if (cancelled) return;
        setSettings(loaded);
        setName(loaded.localName);
        setAllowNegative(loaded.allowNegativeStock === 1);
      },
      (failure: unknown) => {
        if (!cancelled) setError(errorMessage(failure));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  const trimmed = name.trim();
  const changes: Partial<Settings> = {};
  if (settings && trimmed !== settings.localName) changes.localName = trimmed;
  if (settings && (allowNegative ? 1 : 0) !== settings.allowNegativeStock) {
    changes.allowNegativeStock = allowNegative ? 1 : 0;
  }
  const changed = Object.keys(changes).length > 0;

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!changed || trimmed === '') return;
    setBusy(true);
    setError(null);
    setDone(null);
    api
      .put('/settings', changes, settingsSchema)
      .then(
        (saved) => {
          setSettings(saved);
          setName(saved.localName);
          setDone('Ajustes guardados.');
        },
        (failure: unknown) => {
          setError(errorMessage(failure));
        },
      )
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <Frame title="Ajustes del local">
      <form className="settings-form" onSubmit={submit}>
        {settings === null && !error && <span className="muted">Leyendo los ajustes…</span>}
        {settings && (
          <>
            <div className="field">
              <label className="label" htmlFor="ajuste-nombre">
                Nombre del local
              </label>
              <input
                id="ajuste-nombre"
                className="input"
                autoComplete="off"
                maxLength={60}
                value={name}
                aria-invalid={trimmed === ''}
                onChange={(event) => {
                  setDone(null);
                  setName(event.target.value);
                }}
              />
              <span className="field-hint">Sale arriba en el reporte del cierre de caja.</span>
              {trimmed === '' && <span className="field-error">Escribe el nombre del local.</span>}
            </div>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={allowNegative}
                onChange={(event) => {
                  setDone(null);
                  setAllowNegative(event.target.checked);
                }}
              />
              <span>
                <strong>Permitir vender sin stock</strong>
                <span className="field-hint" style={{ display: 'block' }}>
                  Si está marcado, la Caja deja vender un producto agotado y su stock queda en
                  negativo. Si no, no se puede vender por debajo de 0.
                </span>
              </span>
            </label>
          </>
        )}
        {error && (
          <div role="alert" className="alert-error">
            {error}
          </div>
        )}
        {done && (
          <span role="status" className="field-hint">
            {done}
          </span>
        )}
        {settings && (
          <button
            type="submit"
            className="btn btn-primary"
            style={{ alignSelf: 'flex-start' }}
            disabled={busy || !changed || trimmed === ''}
          >
            {busy ? 'Guardando…' : 'Guardar ajustes'}
          </button>
        )}
      </form>
    </Frame>
  );
}
