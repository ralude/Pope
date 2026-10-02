// Turno de caja en la barra superior (T41, decidido por el mantenedor): «Sin turno · Abrir
// turno» lo abre al momento; «Turno abierto · 14:02» pide confirmación para cerrarlo. El
// dueño no cobra, así que no la ve.
import { formatLocalTime } from '@pope/shared';
import { type SyntheticEvent, useCallback, useState } from 'react';

import { ApiError } from '../api/client.js';
import { useShift } from '../shift.js';
import { Dialog } from './Dialog.js';

function errorMessage(failure: unknown): string {
  return failure instanceof ApiError ? failure.message : String(failure);
}

export function ShiftPill() {
  const { canCharge, shift, open, close } = useShift();
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopClosing = useCallback(() => {
    setClosing(false);
    setError(null);
  }, []);

  if (!canCharge || shift === undefined) return null;

  if (!shift) {
    return (
      <>
        <button
          type="button"
          className="shift-pill shift-closed"
          disabled={busy}
          title={error ?? undefined}
          onClick={() => {
            setBusy(true);
            setError(null);
            open()
              .catch((failure: unknown) => {
                setError(errorMessage(failure));
              })
              .finally(() => {
                setBusy(false);
              });
          }}
        >
          <span className="status-dot" style={{ background: 'var(--amber-bar)' }} />
          {busy ? 'Abriendo turno…' : 'Sin turno · Abrir turno'}
        </button>
        {error && (
          <span role="alert" className="field-error">
            {error}
          </span>
        )}
      </>
    );
  }

  const openedAt = formatLocalTime(new Date(shift.openedAt));
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    close().then(
      () => {
        setBusy(false);
        setClosing(false);
      },
      (failure: unknown) => {
        setBusy(false);
        setError(errorMessage(failure));
      },
    );
  };

  return (
    <>
      <button
        type="button"
        className="shift-pill shift-open"
        onClick={() => {
          setClosing(true);
        }}
      >
        <span className="status-dot" style={{ background: 'var(--green-bar)' }} />
        Turno abierto · {openedAt}
      </button>
      {closing && (
        <Dialog title="Cerrar el turno de caja" onClose={stopClosing} onSubmit={submit}>
          <p className="detail-note" style={{ margin: 0 }}>
            Tu turno está abierto desde las {openedAt}. Al cerrarlo ya no podrás recargar, vender
            combos en caja ni abrir sesiones temporales hasta que abras otro.
          </p>
          {error && (
            <div role="alert" className="alert-error">
              {error}
            </div>
          )}
          <div className="dialog-actions">
            <button autoFocus type="button" className="btn btn-ghost" onClick={stopClosing}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Cerrando…' : 'Cerrar turno'}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
