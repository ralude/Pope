// "Abrir caja" (REQ-005-40), como en el diseño: el efectivo que hay en la caja al empezar, en
// USD y en Bs. Al cerrar se compara con lo que se cobre.
import { type OpeningCash } from '@pope/shared';
import { type SyntheticEvent, useState } from 'react';

import { ApiError } from '../api/client.js';
import { Dialog } from '../ui/Dialog.js';
import { parseAmount } from '../ui/money.js';

export function OpenCashDialog({
  onOpen,
  onClose,
}: {
  onOpen: (opening: OpeningCash) => Promise<void>;
  onClose: () => void;
}) {
  const [usdText, setUsdText] = useState('');
  const [vesText, setVesText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usd = parseAmount(usdText);
  const ves = parseAmount(vesText);
  const valid = usd !== null && ves !== null;

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (usd === null || ves === null) return;
    setBusy(true);
    setError(null);
    onOpen({ cashUsdMicros: usd, cashVesMicros: ves }).then(onClose, (failure: unknown) => {
      setBusy(false);
      setError(failure instanceof ApiError ? failure.message : String(failure));
    });
  };

  return (
    <Dialog title="Abrir caja" onClose={onClose} onSubmit={submit}>
      <p className="detail-note" style={{ margin: 0 }}>
        Cuenta el efectivo que hay en la caja antes de empezar. Al cerrar se compara con lo que se
        cobre hoy.
      </p>
      <div className="detail-grid">
        <div className="field">
          <label className="label" htmlFor="fondo-usd">
            Efectivo en USD
          </label>
          <input
            id="fondo-usd"
            className="input amount-input"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            placeholder="0,00"
            value={usdText}
            aria-invalid={usdText !== '' && usd === null}
            onChange={(event) => {
              setUsdText(event.target.value);
            }}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="fondo-bs">
            Efectivo en Bs
          </label>
          <input
            id="fondo-bs"
            className="input amount-input"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            value={vesText}
            aria-invalid={vesText !== '' && ves === null}
            onChange={(event) => {
              setVesText(event.target.value);
            }}
          />
        </div>
      </div>
      {((usdText !== '' && usd === null) || (vesText !== '' && ves === null)) && (
        <span className="field-error">
          Escribe el importe, p. ej. 20,00 o 1.500,00 (0 si no hay).
        </span>
      )}
      {error && (
        <div role="alert" className="alert-error">
          {error}
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || !valid}>
          {busy ? 'Abriendo…' : 'Abrir caja'}
        </button>
      </div>
    </Dialog>
  );
}
