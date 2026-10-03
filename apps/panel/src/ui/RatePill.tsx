// Tasa de cambio en la barra superior (REQ-005-34 a REQ-005-36, plan 005): la vigente, «Sin
// tasa» o «Tasa del lunes» en ámbar. El encargado y el administrador la cambian desde aquí con
// «Tasa del día»; el dueño la ve, pero no la abre.
import { exchangeRateStatusSchema } from '@pope/shared';
import { type SyntheticEvent, useCallback, useState } from 'react';

import { ApiError } from '../api/client.js';
import { usePcMapFeed } from '../map/channel.js';
import { parseVesRate, rateOrigin, ratePill, rateText } from '../rate/model.js';
import { useSession, useStaff } from '../session.js';
import { Dialog } from './Dialog.js';

function RateDialog({ onClose }: { onClose: () => void }) {
  const { api } = useSession();
  const { rate } = usePcMapFeed();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = parseVesRate(text);
  const current = rate?.rate ?? null;

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (value === null) return;
    setBusy(true);
    setError(null);
    // El canal del panel trae la tasa nueva a todas las pantallas (REQ-005-36).
    api
      .post('/exchange-rate', { vesPerUsd: value }, exchangeRateStatusSchema)
      .then(onClose, (failure: unknown) => {
        setBusy(false);
        setError(failure instanceof ApiError ? failure.message : String(failure));
      });
  };

  return (
    <Dialog title="Tasa del día" onClose={onClose} onSubmit={submit}>
      <div className="summary-box">
        {current ? (
          <>
            <strong>Vigente: {rateText(current.vesPerUsd)}</strong>
            <span className="muted">{rateOrigin(current)}</span>
            {rate?.stale && (
              <span className="field-error">Tiene más de un día hábil: escribe la de hoy.</span>
            )}
          </>
        ) : (
          <strong>Aún no hay tasa: sin ella no se puede cobrar en bolívares.</strong>
        )}
      </div>
      <div className="field">
        <label className="label" htmlFor="tasa-valor">
          Bs por 1 USD
        </label>
        <input
          id="tasa-valor"
          className="input amount-input"
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          placeholder="p. ej. 40,50"
          value={text}
          aria-invalid={text !== '' && value === null}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
        {text !== '' && value === null && (
          <span className="field-error">Escribe cuántos Bs vale 1 USD, p. ej. 40,50.</span>
        )}
        {value !== null && <span className="field-hint">Quedará: {rateText(value)}</span>}
      </div>
      <span className="field-hint">
        Vale desde que la guardes, para el panel y para las PCs con sesión.
      </span>
      {error && (
        <div role="alert" className="alert-error">
          {error}
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || value === null}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </Dialog>
  );
}

export function RatePill() {
  const staff = useStaff();
  const { rate } = usePcMapFeed();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => {
    setOpen(false);
  }, []);
  if (rate === null) return null;

  const { text, warn } = ratePill(rate);
  const canChange = staff.role !== 'dueno';
  const title = rate.rate
    ? `${rateText(rate.rate.vesPerUsd)} · ${rateOrigin(rate.rate)}`
    : 'Sin tasa de cambio';
  return (
    <>
      <button
        type="button"
        className={`rate-pill${warn ? ' rate-warn' : ''}`}
        title={canChange ? `${title}. Pulsa para cambiarla.` : title}
        disabled={!canChange}
        onClick={() => {
          setOpen(true);
        }}
      >
        {warn && <span className="status-dot" style={{ background: 'var(--amber-bar)' }} />}
        <span className="num">{text}</span>
      </button>
      {open && <RateDialog onClose={close} />}
    </>
  );
}
