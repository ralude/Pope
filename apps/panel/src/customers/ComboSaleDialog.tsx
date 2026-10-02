// Vender un combo a un cliente con cuenta (REQ-001-84, REQ-001-85): con su saldo en dinero,
// o cobrado en caja con método de pago y turno. El nodo cobra antes la sesión en curso.
import {
  type Combo,
  type ComboPurchaseRequest,
  comboSchema,
  type Customer,
  type CustomerBalances,
  customerSchema,
  formatDuration,
  formatMoney,
  micros,
  type PaymentMethod,
  seconds,
} from '@pope/shared';
import { type SyntheticEvent, useEffect, useState } from 'react';

import { ApiError, listOf } from '../api/client.js';
import { useSession } from '../session.js';
import { useShift } from '../shift.js';
import { PaymentMethodField, ShiftRequirement } from '../ui/charge.js';
import { Dialog } from '../ui/Dialog.js';

const combosSchema = listOf(comboSchema);

type Via = ComboPurchaseRequest['payment']['via'];

function errorMessage(failure: unknown): string {
  return failure instanceof ApiError ? failure.message : String(failure);
}

export function ComboSaleDialog({
  customer,
  balances,
  onClose,
  onDone,
}: {
  customer: { id: string; username: string };
  /** Saldo que se muestra antes de vender. */
  balances: CustomerBalances;
  onClose: () => void;
  onDone: (customer: Customer) => void;
}) {
  const { api } = useSession();
  const { shift } = useShift();
  const [combos, setCombos] = useState<Combo[] | null>(null);
  const [comboId, setComboId] = useState<string | null>(null);
  const [via, setVia] = useState<Via>('balance');
  const [method, setMethod] = useState<PaymentMethod>('cash_usd');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/combos', combosSchema).then(
      (list) => {
        if (cancelled) return;
        const forSale = list.filter((combo) => combo.active);
        setCombos(forSale);
        setComboId(forSale[0]?.id ?? null);
      },
      (failure: unknown) => {
        if (!cancelled) setError(errorMessage(failure));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  const combo = combos?.find((c) => c.id === comboId) ?? null;
  const enough = combo !== null && balances.moneyMicros >= combo.priceMicros;
  const ready = combo !== null && (via === 'balance' ? enough : Boolean(shift));

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!combo || !ready) return;
    const body: ComboPurchaseRequest = {
      comboId: combo.id,
      payment: via === 'balance' ? { via } : { via, paymentMethod: method },
    };
    setBusy(true);
    setError(null);
    api
      .post(`/customers/${customer.id}/combo-purchases`, body, customerSchema)
      .then(onDone, (failure: unknown) => {
        setBusy(false);
        setError(errorMessage(failure));
      });
  };

  return (
    <Dialog title={`Vender combo a ${customer.username}`} onClose={onClose} onSubmit={submit}>
      {combos === null && !error && <span className="muted">Cargando combos…</span>}
      {combos?.length === 0 && (
        <p className="detail-note" style={{ margin: 0 }}>
          No hay combos a la venta. El administrador los crea en la sección Combos.
        </p>
      )}
      {combos && combos.length > 0 && (
        <>
          <fieldset className="choice-group">
            <legend className="sr-only">Combo</legend>
            {combos.map((c) => (
              <label key={c.id} className="choice combo-choice" data-checked={c.id === comboId}>
                <input
                  type="radio"
                  name="combo"
                  value={c.id}
                  checked={c.id === comboId}
                  onChange={() => {
                    setComboId(c.id);
                  }}
                />
                <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                  <strong style={{ fontSize: 16 }}>{c.name}</strong>
                  <span className="muted num" style={{ fontSize: 13 }}>
                    {formatDuration(seconds(c.seconds))} ·{' '}
                    {formatMoney(c.ratePerHourMicros, { suffix: '/h' })}
                  </span>
                </span>
                <strong className="num" style={{ fontSize: 18 }}>
                  {formatMoney(c.priceMicros)}
                </strong>
              </label>
            ))}
          </fieldset>
          <div className="segmented" role="group" aria-label="Forma de pago">
            <button
              type="button"
              aria-pressed={via === 'balance'}
              onClick={() => {
                setVia('balance');
              }}
            >
              Con su saldo
            </button>
            <button
              type="button"
              aria-pressed={via === 'cash_desk'}
              onClick={() => {
                setVia('cash_desk');
              }}
            >
              Cobrar en caja
            </button>
          </div>
          {via === 'balance' ? (
            <>
              <div className="summary-box">
                <span className="muted">Saldo: {formatMoney(balances.moneyMicros)}</span>
                {combo && enough && (
                  <strong>
                    Le quedan: {formatMoney(micros(balances.moneyMicros - combo.priceMicros))}
                  </strong>
                )}
              </div>
              {combo && !enough && (
                <span className="field-error">
                  No le alcanza el saldo para este combo. Puedes cobrarlo en caja.
                </span>
              )}
            </>
          ) : (
            <>
              {shift && (
                <PaymentMethodField name="pago-combo" value={method} onChange={setMethod} />
              )}
              <ShiftRequirement what="Las ventas en caja" />
            </>
          )}
        </>
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
        {combo && (
          <button type="submit" className="btn btn-primary" disabled={busy || !ready}>
            {busy ? 'Vendiendo…' : `Vender ${combo.name}`}
          </button>
        )}
      </div>
    </Dialog>
  );
}
