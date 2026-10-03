// Entrada de mercancía, ajuste o merma de un producto (REQ-005-10, REQ-005-14). La entrada la
// registran el encargado y el administrador; ajuste y merma, solo el administrador y con
// motivo. El stock nunca se escribe: cada uno es un movimiento.
import { type Product, productSchema, type StockMoveRequest } from '@pope/shared';
import { type SyntheticEvent, useState } from 'react';

import { ApiError } from '../api/client.js';
import { useSession } from '../session.js';
import { Dialog } from '../ui/Dialog.js';
import { parseQuantity } from './model.js';

export type StockKind = StockMoveRequest['kind'];

const TEXTS: Record<StockKind, { title: string; quantity: string; hint: string; submit: string }> =
  {
    restock: {
      title: 'Entrada de mercancía',
      quantity: 'Cantidad que llegó',
      hint: 'Se suma al stock.',
      submit: 'Registrar entrada',
    },
    adjustment: {
      title: 'Ajuste de stock',
      quantity: 'Cuánto sumar o restar',
      hint: 'Escribe «-2» para restar 2 o «3» para sumar 3.',
      submit: 'Registrar ajuste',
    },
    waste: {
      title: 'Merma',
      quantity: 'Unidades perdidas',
      hint: 'Se resta del stock: rotas, vencidas o perdidas.',
      submit: 'Registrar merma',
    },
  };

export function StockDialog({
  product,
  kind,
  onClose,
  onDone,
}: {
  product: Product;
  kind: StockKind;
  onClose: () => void;
  onDone: (product: Product) => void;
}) {
  const { api } = useSession();
  const [quantityText, setQuantityText] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const texts = TEXTS[kind];
  const quantity = parseQuantity(quantityText, kind === 'adjustment');
  const needsReason = kind !== 'restock';
  const trimmed = reason.trim();
  const valid = quantity !== null && (!needsReason || trimmed !== '');
  const delta = quantity === null ? null : kind === 'waste' ? -quantity : quantity;

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    const body = { kind, quantity, ...(trimmed !== '' && { reason: trimmed }) };
    api
      .post(`/products/${product.id}/stock`, body, productSchema)
      .then(onDone, (failure: unknown) => {
        setBusy(false);
        setError(failure instanceof ApiError ? failure.message : String(failure));
      });
  };

  return (
    <Dialog title={`${texts.title} · ${product.name}`} onClose={onClose} onSubmit={submit}>
      <div className="field">
        <label className="label" htmlFor="stock-cantidad">
          {texts.quantity}
        </label>
        <input
          id="stock-cantidad"
          className="input amount-input"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={quantityText}
          aria-invalid={quantityText !== '' && quantity === null}
          onChange={(event) => {
            setQuantityText(event.target.value);
          }}
        />
        <span className="field-hint">{texts.hint}</span>
        {quantityText !== '' && quantity === null && (
          <span className="field-error">Escribe una cantidad entera distinta de 0.</span>
        )}
      </div>
      <div className="field">
        <label className="label" htmlFor="stock-motivo">
          {needsReason ? 'Motivo' : 'Nota (opcional)'}
        </label>
        <input
          id="stock-motivo"
          className="input"
          autoComplete="off"
          maxLength={200}
          placeholder={needsReason ? 'p. ej. bolsa rota, conteo' : ''}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </div>
      <div className="summary-box">
        <span className="muted">Stock ahora: {product.stock}</span>
        <strong>Quedará: {delta === null ? '—' : product.stock + delta}</strong>
      </div>
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
          {busy ? 'Guardando…' : texts.submit}
        </button>
      </div>
    </Dialog>
  );
}
