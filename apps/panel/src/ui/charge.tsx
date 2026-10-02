// Piezas comunes de los diálogos que cobran en caja (recargas, combos y sesiones temporales):
// el método de pago y el aviso de que hace falta un turno abierto (REQ-001-03, REQ-001-60).
import { formatLocalTime, type PaymentMethod } from '@pope/shared';
import { useState } from 'react';

import { ApiError } from '../api/client.js';
import { useShift } from '../shift.js';
import { PAYMENT_LABEL, PAYMENT_METHODS } from './money.js';

export function PaymentMethodField({
  name,
  value,
  onChange,
}: {
  /** Nombre del grupo de botones de opción; único en la página. */
  name: string;
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
}) {
  return (
    <fieldset className="choice-group">
      <legend className="label">Método de pago</legend>
      <div className="choice-grid">
        {PAYMENT_METHODS.map((method) => (
          <label key={method} className="choice" data-checked={method === value}>
            <input
              type="radio"
              name={name}
              value={method}
              checked={method === value}
              onChange={() => {
                onChange(method);
              }}
            />
            {PAYMENT_LABEL[method]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Sin turno abierto, en lugar del formulario: aviso y botón para abrirlo ahí mismo. Con
 * turno, una línea que recuerda dónde queda el cobro.
 */
export function ShiftRequirement({ what }: { what: string }) {
  const { shift, open } = useShift();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (shift === undefined) {
    return <span className="muted">Comprobando tu turno de caja…</span>;
  }
  if (shift) {
    return (
      <span className="field-hint">
        Se registra en tu turno (abierto a las {formatLocalTime(new Date(shift.openedAt))}).
      </span>
    );
  }
  return (
    <div className="notice-warn">
      <span>Abre un turno de caja para continuar. {what} quedan registradas en tu turno.</span>
      {error && <span role="alert">{error}</span>}
      <button
        type="button"
        className="btn btn-primary"
        style={{ alignSelf: 'flex-start' }}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          open()
            .catch((failure: unknown) => {
              setError(failure instanceof ApiError ? failure.message : String(failure));
            })
            .finally(() => {
              setBusy(false);
            });
        }}
      >
        {busy ? 'Abriendo…' : 'Abrir turno de caja'}
      </button>
    </div>
  );
}
