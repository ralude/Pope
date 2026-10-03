// Cobro de la venta nueva (REQ-005-20 a REQ-005-22, REQ-005-25): el método, como en el diseño,
// «Dividir pago» para un segundo método, lo que se cobra en Bs con la tasa, la cuenta que paga
// con su saldo y «Cobrar». El nodo comprueba de nuevo stock, saldo, tasa y caja abierta.
import {
  type CashMethod,
  type CashMovement,
  cashMovementSchema,
  type Customer,
  customerPageSchema,
  formatMoney,
  formatVes,
  type Micros,
  micros,
  type VesRate,
} from '@pope/shared';
import { type SyntheticEvent, useState } from 'react';

import { ApiError } from '../api/client.js';
import { searchPath } from '../customers/model.js';
import { rateText } from '../rate/model.js';
import { useSession } from '../session.js';
import { type CartLine, saleLines } from './model.js';
import {
  buildPayments,
  CASH_METHOD_LABEL,
  CASH_METHODS,
  needsAccount,
  needsRate,
  vesCharges,
} from './payment.js';

function errorMessage(failure: unknown): string {
  return failure instanceof ApiError ? failure.message : String(failure);
}

function MethodChips({
  value,
  onChange,
  label,
}: {
  value: CashMethod;
  onChange: (method: CashMethod) => void;
  label: string;
}) {
  return (
    <fieldset className="caja-methods">
      <legend className="label">{label}</legend>
      <div className="caja-method-grid">
        {CASH_METHODS.map((method) => (
          <button
            key={method}
            type="button"
            className="caja-method"
            aria-pressed={method === value}
            onClick={() => {
              onChange(method);
            }}
          >
            {CASH_METHOD_LABEL[method]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Busca la cuenta del cliente que paga con su saldo (REQ-005-21). */
function AccountPicker({
  account,
  onChange,
}: {
  account: Customer | null;
  onChange: (account: Customer | null) => void;
}) {
  const { api } = useSession();
  const [text, setText] = useState('');
  const [results, setResults] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (account) {
    return (
      <div className="caja-note">
        <span>
          Cuenta: <strong>{account.username}</strong> · saldo{' '}
          <span className="num">{formatMoney(account.balances.moneyMicros)}</span>
        </span>
        <button
          type="button"
          className="caja-link"
          onClick={() => {
            onChange(null);
          }}
        >
          Cambiar
        </button>
      </div>
    );
  }

  const search = () => {
    setError(null);
    api.get(searchPath(text, 0), customerPageSchema).then(
      (page) => {
        setResults(page.items.filter((c) => c.status === 'active').slice(0, 5));
      },
      (failure: unknown) => {
        setError(errorMessage(failure));
      },
    );
  };

  return (
    <div className="caja-note" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="input"
          style={{ height: 34, flexGrow: 1, minWidth: 0 }}
          placeholder="Usuario o nombre"
          aria-label="Buscar la cuenta que paga con su saldo"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              search();
            }
          }}
        />
        <button type="button" className="btn btn-ghost" style={{ height: 34 }} onClick={search}>
          Buscar
        </button>
      </div>
      {error && <span className="field-error">{error}</span>}
      {results?.length === 0 && <span className="muted">Ninguna cuenta activa se llama así.</span>}
      {results?.map((customer) => (
        <button
          key={customer.id}
          type="button"
          className="caja-account"
          onClick={() => {
            onChange(customer);
          }}
        >
          <strong>{customer.username}</strong>
          <span className="muted num">{formatMoney(customer.balances.moneyMicros)}</span>
        </button>
      ))}
    </div>
  );
}

export function Checkout({
  cart,
  total,
  vesRate,
  shiftOpen,
  onSold,
}: {
  cart: CartLine[];
  total: Micros;
  vesRate: VesRate | undefined;
  shiftOpen: boolean;
  onSold: (movement: CashMovement) => void;
}) {
  const { api } = useSession();
  const [method, setMethod] = useState<CashMethod>('cash_usd');
  const [split, setSplit] = useState<{ method: CashMethod; text: string } | null>(null);
  const [account, setAccount] = useState<Customer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const built = buildPayments(total, { method, split });
  const payments = 'payments' in built ? built.payments : [];
  const withBalance = needsAccount(payments) || method === 'balance' || split?.method === 'balance';
  const missingRate = needsRate(payments) && vesRate === undefined;
  const problem = !shiftOpen
    ? 'La caja está cerrada: ábrela para cobrar.'
    : cart.length === 0
      ? null
      : 'error' in built
        ? built.error
        : missingRate
          ? 'No hay tasa de cambio: escríbela arriba para cobrar en bolívares.'
          : withBalance && !account
            ? 'Elige la cuenta que paga con su saldo.'
            : null;
  const canCharge = cart.length > 0 && problem === null && !busy;

  const charge = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!canCharge) return;
    setBusy(true);
    setError(null);
    api
      .post(
        '/sales',
        {
          lines: saleLines(cart),
          payments,
          customerId: withBalance ? (account?.id ?? null) : null,
        },
        cashMovementSchema,
      )
      .then(
        (movement) => {
          setBusy(false);
          setSplit(null);
          setAccount(null);
          onSold(movement);
        },
        (failure: unknown) => {
          setBusy(false);
          setError(errorMessage(failure));
        },
      );
  };

  return (
    <form className="caja-checkout" onSubmit={charge}>
      <MethodChips label="Método de pago" value={method} onChange={setMethod} />
      {split ? (
        <div className="caja-split">
          <MethodChips
            label="Segundo pago"
            value={split.method}
            onChange={(second) => {
              setSplit({ ...split, method: second });
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              className="input num"
              style={{ height: 34 }}
              inputMode="decimal"
              autoComplete="off"
              placeholder="Importe (USD)"
              aria-label="Importe del segundo pago en USD"
              value={split.text}
              onChange={(event) => {
                setSplit({ ...split, text: event.target.value });
              }}
            />
            <button
              type="button"
              className="caja-link"
              onClick={() => {
                setSplit(null);
              }}
            >
              Quitar
            </button>
          </div>
          {'payments' in built && (
            <span className="field-hint num">
              {payments
                .map((p) => `${CASH_METHOD_LABEL[p.method]} ${formatMoney(p.usdMicros)}`)
                .join(' + ')}
            </span>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="caja-link"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => {
            setSplit({ method: method === 'cash_usd' ? 'pos' : 'cash_usd', text: '' });
          }}
        >
          Dividir pago
        </button>
      )}
      {withBalance && <AccountPicker account={account} onChange={setAccount} />}
      {vesRate !== undefined && needsRate(payments) && cart.length > 0 && (
        <div className="caja-note">
          <span className="num">
            Se cobran{' '}
            {vesCharges(payments, vesRate).map((charge, index) => (
              <strong key={charge.method}>
                {index > 0 && ' + '}
                {formatVes(charge.ves)}
              </strong>
            ))}{' '}
            a {rateText(vesRate).replace('1 USD = ', '')} por USD
          </span>
        </div>
      )}
      {problem && cart.length > 0 && <span className="field-error">{problem}</span>}
      {!shiftOpen && cart.length === 0 && <span className="muted">{problem}</span>}
      {error && (
        <div role="alert" className="alert-error">
          {error}
        </div>
      )}
      <button type="submit" className="btn btn-primary btn-lg" disabled={!canCharge}>
        {busy ? 'Cobrando…' : cart.length === 0 ? 'Cobrar' : `Cobrar ${formatMoney(micros(total))}`}
      </button>
    </form>
  );
}
