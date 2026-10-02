// Recargar saldo (REQ-001-03): importe y método de pago, en el turno de quien cobra. El
// sistema no verifica el pago: lo comprueba el encargado antes de recargar.
import {
  type Customer,
  type CustomerBalances,
  customerSchema,
  formatMoney,
  micros,
  type PaymentMethod,
  usd,
} from '@pope/shared';
import { type SyntheticEvent, useState } from 'react';

import { ApiError } from '../api/client.js';
import { useSession } from '../session.js';
import { useShift } from '../shift.js';
import { PaymentMethodField, ShiftRequirement } from '../ui/charge.js';
import { Dialog } from '../ui/Dialog.js';
import { formatUsdInput, parseUsd } from '../ui/money.js';

/** Importes rápidos del diseño. */
const QUICK_AMOUNTS = [usd(1), usd(2), usd(5), usd(10)];

export function RechargeDialog({
  customer,
  balances,
  onClose,
  onDone,
}: {
  customer: { id: string; username: string };
  /** Saldo que se muestra antes de recargar. */
  balances: CustomerBalances;
  onClose: () => void;
  onDone: (customer: Customer) => void;
}) {
  const { api } = useSession();
  const { shift } = useShift();
  const [text, setText] = useState(formatUsdInput(usd(5)));
  const [method, setMethod] = useState<PaymentMethod>('cash_usd');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = parseUsd(text);

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (amount === null || !shift) return;
    setBusy(true);
    setError(null);
    api
      .post(
        `/customers/${customer.id}/recharges`,
        { amountMicros: amount, paymentMethod: method },
        customerSchema,
      )
      .then(onDone, (failure: unknown) => {
        setBusy(false);
        setError(failure instanceof ApiError ? failure.message : String(failure));
      });
  };

  return (
    <Dialog title={`Recargar saldo a ${customer.username}`} onClose={onClose} onSubmit={submit}>
      {shift ? (
        <>
          <div className="field">
            <label className="label" htmlFor="recarga-importe">
              Importe (USD)
            </label>
            <input
              id="recarga-importe"
              className="input amount-input"
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              value={text}
              aria-invalid={amount === null}
              onChange={(event) => {
                setText(event.target.value);
              }}
            />
            {amount === null && (
              <span className="field-error">Escribe un importe mayor que cero, p. ej. 5,00.</span>
            )}
            <div className="chips">
              {QUICK_AMOUNTS.map((quick) => (
                <button
                  key={quick}
                  type="button"
                  className="chip num"
                  aria-pressed={amount === quick}
                  onClick={() => {
                    setText(formatUsdInput(quick));
                  }}
                >
                  {formatUsdInput(quick)}
                </button>
              ))}
            </div>
          </div>
          <PaymentMethodField name="pago-recarga" value={method} onChange={setMethod} />
          <div className="summary-box">
            <span className="muted">Saldo: {formatMoney(balances.moneyMicros)}</span>
            <strong>
              Tras recargar:{' '}
              {amount === null ? '—' : formatMoney(micros(balances.moneyMicros + amount))}
            </strong>
          </div>
          <span className="field-hint">
            El sistema no comprueba el pago: confírmalo antes de recargar.
          </span>
        </>
      ) : null}
      <ShiftRequirement what="Las recargas" />
      {error && (
        <div role="alert" className="alert-error">
          {error}
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        {shift && (
          <button type="submit" className="btn btn-primary" disabled={busy || amount === null}>
            {busy
              ? 'Recargando…'
              : amount === null
                ? 'Recargar'
                : `Recargar ${formatMoney(amount)}`}
          </button>
        )}
      </div>
    </Dialog>
  );
}
