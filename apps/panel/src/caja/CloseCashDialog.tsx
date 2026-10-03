// "Cerrar caja" (REQ-005-42, REQ-005-45), como en el diseño, en tres pasos: contar lo que hay
// en cada método frente a lo esperado, "¿Seguro que quieres cerrar la caja?" y "Caja cerrada",
// tras descargar sí o sí el reporte del encargado en PDF (REQ-005-51).
import {
  type CashByMethod,
  formatLocalTime,
  formatMoney,
  localDateInCaracas,
  type ShiftClosing,
  shiftClosingSchema,
  type ShiftSummary,
} from '@pope/shared';
import { type SyntheticEvent, useEffect, useState } from 'react';

import { ApiError } from '../api/client.js';
import { useSession } from '../session.js';
import { Dialog } from '../ui/Dialog.js';
import { parseAmount } from '../ui/money.js';
import {
  closingRows,
  difference,
  differencesSummary,
  differenceText,
  formatIn,
} from './closing.js';

function errorMessage(failure: unknown): string {
  return failure instanceof ApiError ? failure.message : String(failure);
}

/** Descarga el PDF del encargado de una caja con su nombre de archivo (REQ-005-45). */
export function downloadReport(summary: { id: string; openedAt: string }): string {
  const name = `cierre-caja-${localDateInCaracas(new Date(summary.openedAt))}.pdf`;
  const link = document.createElement('a');
  link.href = `/shifts/${summary.id}/report.pdf`;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  return name;
}

type Step = 'count' | 'confirm' | 'done';

export function CloseCashDialog({
  onClose,
  close,
}: {
  onClose: () => void;
  close: (counted: CashByMethod) => Promise<ShiftSummary>;
}) {
  const { api } = useSession();
  const [closing, setClosing] = useState<ShiftClosing | null>(null);
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [step, setStep] = useState<Step>('count');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<{ summary: ShiftSummary; file: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/shifts/current/closing', shiftClosingSchema).then(
      (data) => {
        if (!cancelled) setClosing(data);
      },
      (failure: unknown) => {
        if (!cancelled) setError(errorMessage(failure));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  const rows = closing ? closingRows(closing) : [];
  const amounts = rows.map((row) => parseAmount(counted[row.method] ?? ''));
  const complete = rows.length > 0 && amounts.every((amount) => amount !== null);
  const summary = differencesSummary(rows, counted);

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (step === 'count') {
      if (complete) setStep('confirm');
      return;
    }
    if (step !== 'confirm' || !complete) return;
    const body = Object.fromEntries(
      rows.map((row, index) => [row.method, amounts[index] ?? 0]),
    ) as CashByMethod;
    setBusy(true);
    setError(null);
    close(body).then(
      (result) => {
        setBusy(false);
        // El reporte se descarga sí o sí al cerrar (REQ-005-45).
        setClosed({ summary: result, file: downloadReport(result) });
        setStep('done');
      },
      (failure: unknown) => {
        setBusy(false);
        setError(errorMessage(failure));
      },
    );
  };

  if (step === 'done' && closed) {
    return (
      <Dialog
        title="Caja cerrada"
        onClose={onClose}
        onSubmit={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <p className="detail-note" style={{ margin: 0 }} role="status">
          Se descargó <strong>{closed.file}</strong>. Imprímelo o mándalo al grupo.
        </p>
        <div className="dialog-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              downloadReport(closed.summary);
            }}
          >
            Descargarlo otra vez
          </button>
          <button type="submit" className="btn btn-primary" autoFocus>
            Listo
          </button>
        </div>
      </Dialog>
    );
  }

  if (step === 'confirm') {
    return (
      <Dialog title="¿Seguro que quieres cerrar la caja?" onClose={onClose} onSubmit={submit}>
        <p className="detail-note" style={{ margin: 0 }}>
          Se cierra la caja y se descarga el reporte del día en PDF. Después no se pueden registrar
          más cobros en ella.
        </p>
        {summary !== '' && (
          <div className="notice-warn">Hay diferencias en el conteo: {summary}.</div>
        )}
        {error && (
          <div role="alert" className="alert-error">
            {error}
          </div>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setStep('count');
            }}
          >
            Volver
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy} autoFocus>
            {busy ? 'Cerrando…' : 'Sí, cerrar y descargar'}
          </button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title="Cerrar caja" onClose={onClose} onSubmit={submit}>
      <p className="detail-note" style={{ margin: 0 }}>
        {closing
          ? `Abierta a las ${formatLocalTime(new Date(closing.openedAt))}. Cuenta lo que hay en cada método.`
          : 'Leyendo lo esperado…'}
      </p>
      {rows.length > 0 && (
        <table className="closing-table">
          <thead>
            <tr>
              <th>Método</th>
              <th className="num-cell">Esperado</th>
              <th className="num-cell">Contado</th>
              <th className="num-cell">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const text = counted[row.method] ?? '';
              const diff = differenceText(row, difference(row, text));
              return (
                <tr key={row.method}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{row.label}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {row.hint}
                    </div>
                  </td>
                  <td className="num-cell num">{formatIn(row.currency, row.expected)}</td>
                  <td className="num-cell">
                    <input
                      className="input num closing-input"
                      inputMode="decimal"
                      autoComplete="off"
                      aria-label={`Contado en ${row.label}`}
                      value={text}
                      aria-invalid={text !== '' && parseAmount(text) === null}
                      onChange={(event) => {
                        setCounted({ ...counted, [row.method]: event.target.value });
                      }}
                    />
                  </td>
                  <td className={`num-cell num closing-diff closing-${diff.tone}`}>{diff.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {closing && (
        <div className="closing-totals num">
          {(
            [
              ['Horas de PC', closing.totals.pc],
              ['Golosinas', closing.totals.snacks],
              ['Otras ventas', closing.totals.other],
              ['Total vendido', closing.totals.total],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <div className="muted" style={{ fontSize: 11 }}>
                {label}
              </div>
              <strong>{formatMoney(value)}</strong>
            </div>
          ))}
        </div>
      )}
      {closing && closing.totals.balance !== 0 && (
        <span className="muted num" style={{ fontSize: 13 }}>
          Pagado con saldo (no entra en la caja): {formatMoney(closing.totals.balance)}.
        </span>
      )}
      {error && (
        <div role="alert" className="alert-error">
          {error}
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Volver a la caja
        </button>
        <button type="submit" className="btn btn-primary" disabled={!complete}>
          Cerrar caja
        </button>
      </div>
    </Dialog>
  );
}
