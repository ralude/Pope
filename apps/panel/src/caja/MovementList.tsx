// Movimientos del turno (REQ-005-23, REQ-005-24, REQ-005-26): todo lo cobrado en la caja
// abierta en una tabla como la de SENET, el más reciente arriba, con los ingresos del día y
// «Anular» para el administrador. La Caja la pide y la refresca con el aviso `cash`.
import { cashMovementSchema, formatMoney, type ShiftEntriesResponse } from '@pope/shared';
import { type SyntheticEvent, useState } from 'react';

import { ApiError } from '../api/client.js';
import { useSession } from '../session.js';
import { Dialog } from '../ui/Dialog.js';
import { type MovementRow, movementRow, openingRow } from './movements.js';

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

/** Descarga el informe X de la caja abierta (REQ-005-46); el nombre lo pone el nodo. */
function downloadInformeX(): void {
  const link = document.createElement('a');
  link.href = '/shifts/current/report.pdf';
  link.download = '';
  document.body.append(link);
  link.click();
  link.remove();
}

function MovementTableRow({
  row,
  open,
  onToggle,
  onVoid,
}: {
  row: MovementRow;
  open: boolean;
  onToggle: () => void;
  onVoid?: () => void;
}) {
  return (
    <div className="caja-trow-wrap">
      <button
        type="button"
        className="caja-trow"
        aria-expanded={open}
        data-voided={row.voided}
        onClick={onToggle}
      >
        <span className="caja-col-time muted num">{row.time}</span>
        <span className="caja-col-customer">{row.customer}</span>
        <span className="caja-col-state">
          <span className="caja-state" data-state={row.state}>
            {row.state}
          </span>
        </span>
        <span className="caja-col-desc">
          <span className="muted">{open ? '▾' : '▸'}</span> {row.description}
        </span>
        <span className="caja-col-method">{row.methods}</span>
        <span className="caja-col-total num" data-negative={row.negative}>
          {row.total}
          {row.totalBs && <span className="caja-total-bs">{row.totalBs}</span>}
        </span>
      </button>
      {open && (
        <div className="caja-tdetail">
          {row.details.map((detail) => (
            <div key={detail}>{detail}</div>
          ))}
          {onVoid && (
            <button type="button" className="caja-void" onClick={onVoid}>
              Anular
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * La mitad derecha de la Caja, como en SENET: «Informe X», «Cerrar caja (informe Z)», los
 * ingresos del día en grande con sus grupos, y la tabla de movimientos con la apertura al
 * final (REQ-005-24, REQ-005-26, REQ-005-45, REQ-005-46).
 */
export function MovementList({
  entries,
  error,
  isAdmin,
  canClose,
  onClose,
}: {
  /** La caja abierta; `null` si está cerrada, `undefined` mientras se pregunta. */
  entries: ShiftEntriesResponse | null | undefined;
  error: string | null;
  isAdmin: boolean;
  /** Puede cerrarla: quien la abrió o un administrador (REQ-005-44). */
  canClose: boolean;
  onClose: () => void;
}) {
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<{ saleId: string; what: string } | null>(null);
  const totals = entries?.totals;
  const groups = [
    ['Horas de PC', totals?.pc],
    ['Golosinas', totals?.snacks],
    ['Otras ventas', totals?.other],
  ] as const;

  const toggle = (key: string) => {
    setOpenRow((current) => (current === key ? null : key));
  };

  return (
    <section className="card caja-moves" aria-label="Movimientos del turno">
      <div className="caja-moves-head">
        {entries && (
          <>
            <button
              type="button"
              className="btn btn-ghost caja-head-btn"
              onClick={downloadInformeX}
            >
              Informe X
            </button>
            {canClose && (
              <button type="button" className="btn caja-head-btn caja-close-z" onClick={onClose}>
                Cerrar caja (informe Z)
              </button>
            )}
          </>
        )}
        <div style={{ flexGrow: 1 }} />
        <div className="caja-income">
          <div className="muted" style={{ fontSize: 12 }}>
            Ingresos del día
          </div>
          <div className="caja-income-total num">{totals ? formatMoney(totals.total) : '—'}</div>
        </div>
      </div>
      <div className="caja-groups muted num">
        {groups.map(([label, value]) => (
          <span key={label}>
            {label} <strong>{value === undefined ? '—' : formatMoney(value)}</strong>
          </span>
        ))}
        <span>
          Con saldo (fuera de caja){' '}
          <strong className="caja-groups-balance">
            {totals ? formatMoney(totals.balance) : '—'}
          </strong>
        </span>
      </div>
      <div className="caja-thead" role="row">
        <span className="caja-col-time">Hora</span>
        <span className="caja-col-customer">Cliente</span>
        <span className="caja-col-state">Estado</span>
        <span className="caja-col-desc">Descripción</span>
        <span className="caja-col-method">Método</span>
        <span className="caja-col-total">Total</span>
      </div>
      <div className="caja-move-list">
        {entries === null && <p className="detail-note caja-empty">La caja está cerrada.</p>}
        {error && (
          <div role="alert" className="alert-error">
            {error}
          </div>
        )}
        {entries?.movements.map((movement) => {
          const row = movementRow(movement, isAdmin);
          const key = `${movement.source}-${movement.sourceId}`;
          return (
            <MovementTableRow
              key={key}
              row={row}
              open={openRow === key}
              onToggle={() => {
                toggle(key);
              }}
              {...(row.canVoid && {
                onVoid: () => {
                  setVoiding({ saleId: movement.sourceId, what: movement.description });
                },
              })}
            />
          );
        })}
        {entries && (
          <MovementTableRow
            row={openingRow(entries.openedAt, entries.staffName, entries.opening)}
            open={openRow === 'opening'}
            onToggle={() => {
              toggle('opening');
            }}
          />
        )}
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
