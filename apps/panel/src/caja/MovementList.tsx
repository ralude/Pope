// Movimientos del turno (REQ-005-23, REQ-005-24): todo lo cobrado en la caja abierta, el más
// reciente arriba, con los totales por grupo y «Anular» para el administrador. Se refresca con
// el aviso `cash` del canal, así dos pestañas ven lo mismo.
import {
  cashMovementSchema,
  formatMoney,
  type ShiftEntriesResponse,
  shiftEntriesResponseSchema,
} from '@pope/shared';
import { type SyntheticEvent, useEffect, useState } from 'react';

import { ApiError } from '../api/client.js';
import { useSession } from '../session.js';
import { Dialog } from '../ui/Dialog.js';
import { movementRow } from './movements.js';

function errorMessage(failure: unknown): string {
  return failure instanceof ApiError ? failure.message : String(failure);
}

function VoidDialog({
  saleId,
  what,
  onClose,
}: {
  saleId: string;
  what: string;
  onClose: () => void;
}) {
  const { api } = useSession();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = reason.trim();

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (trimmed === '') return;
    setBusy(true);
    setError(null);
    // La lista se refresca sola con el aviso `cash` que manda el nodo tras anular.
    api
      .post(`/sales/${saleId}/void`, { reason: trimmed }, cashMovementSchema)
      .then(onClose, (failure: unknown) => {
        setBusy(false);
        setError(errorMessage(failure));
      });
  };

  return (
    <Dialog title="Anular la venta" onClose={onClose} onSubmit={submit}>
      <p className="detail-note" style={{ margin: 0 }}>
        {what}. Vuelven el stock y, si se pagó con saldo, el saldo; la caja descuenta su importe. No
        se borra nada: la venta y su anulación quedan en la lista y en el reporte.
      </p>
      <div className="field">
        <label className="label" htmlFor="anular-motivo">
          Motivo
        </label>
        <input
          id="anular-motivo"
          className="input"
          autoComplete="off"
          autoFocus
          maxLength={200}
          placeholder="p. ej. error de cobro"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
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
        <button type="submit" className="btn btn-danger" disabled={busy || trimmed === ''}>
          {busy ? 'Anulando…' : 'Anular venta'}
        </button>
      </div>
    </Dialog>
  );
}

export function MovementList({
  shiftId,
  cashVersion,
  isAdmin,
}: {
  /** La caja abierta, o `null` si está cerrada. */
  shiftId: string | null;
  cashVersion: number;
  isAdmin: boolean;
}) {
  const { api } = useSession();
  const [entries, setEntries] = useState<ShiftEntriesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<{ saleId: string; what: string } | null>(null);

  useEffect(() => {
    if (shiftId === null) {
      setEntries(null);
      return;
    }
    let cancelled = false;
    api.get('/shifts/current/entries', shiftEntriesResponseSchema).then(
      (response) => {
        if (cancelled) return;
        setEntries(response);
        setError(null);
      },
      (failure: unknown) => {
        if (!cancelled) setError(errorMessage(failure));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, shiftId, cashVersion]);

  const totals = entries?.totals;
  const tiles = [
    ['Horas de PC', totals?.pc],
    ['Golosinas', totals?.snacks],
    ['Otras ventas', totals?.other],
  ] as const;

  return (
    <section className="card caja-moves" aria-label="Movimientos del turno">
      <div className="caja-moves-head">
        <h2 className="detail-title" style={{ margin: 0 }}>
          Movimientos del turno
        </h2>
        <span className="muted" style={{ fontSize: 12 }}>
          {entries ? `${String(entries.movements.length)} movimientos` : ''}
        </span>
      </div>
      <div className="caja-tiles">
        {tiles.map(([label, value]) => (
          <div key={label} className="caja-tile">
            <span className="muted" style={{ fontSize: 11 }}>
              {label}
            </span>
            <strong className="num">{value === undefined ? '—' : formatMoney(value)}</strong>
          </div>
        ))}
        <div className="caja-tile caja-tile-total">
          <span style={{ fontSize: 11 }}>Total en caja</span>
          <strong className="num">{totals ? formatMoney(totals.total) : '—'}</strong>
        </div>
      </div>
      {totals && totals.balance !== 0 && (
        <span className="muted caja-balance-note num">
          Pagado con saldo (no entra en la caja): {formatMoney(totals.balance)}
        </span>
      )}
      <div className="caja-move-list">
        {shiftId === null && <p className="detail-note caja-empty">La caja está cerrada.</p>}
        {error && (
          <div role="alert" className="alert-error">
            {error}
          </div>
        )}
        {entries?.movements.length === 0 && (
          <p className="detail-note caja-empty">Aún no hay cobros en esta caja.</p>
        )}
        {entries?.movements.map((movement) => {
          const row = movementRow(movement, isAdmin);
          return (
            <div
              key={`${movement.source}-${movement.sourceId}`}
              className="caja-move"
              data-voided={row.voided}
            >
              <span className="muted num caja-move-time">{row.time}</span>
              <div style={{ flexGrow: 1, minWidth: 0 }}>
                <div className="caja-move-what">{row.what}</div>
                <div className="muted caja-move-detail">{row.detail}</div>
              </div>
              <span className={`caja-pill${row.withBalance ? ' caja-pill-balance' : ''}`}>
                {row.methods}
              </span>
              <div className="caja-move-amount num">
                <div style={{ fontWeight: 700 }}>{row.amount}</div>
                {row.amountBs && (
                  <div className="muted" style={{ fontSize: 11 }}>
                    {row.amountBs}
                  </div>
                )}
              </div>
              {row.canVoid && (
                <button
                  type="button"
                  className="caja-void"
                  onClick={() => {
                    setVoiding({ saleId: movement.sourceId, what: movement.description });
                  }}
                >
                  Anular
                </button>
              )}
            </div>
          );
        })}
      </div>
      {voiding && (
        <VoidDialog
          saleId={voiding.saleId}
          what={voiding.what}
          onClose={() => {
            setVoiding(null);
          }}
        />
      )}
    </section>
  );
}
