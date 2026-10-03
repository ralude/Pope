// Cierres de caja (REQ-005-53), para el administrador y el dueño: cada caja con sus totales y
// su diferencia, la más reciente arriba, y sus dos reportes en PDF (resumen y detallado).
import '../caja/caja.css';

import { type ShiftSummary, shiftSummarySchema } from '@pope/shared';
import { useEffect, useState } from 'react';

import { ApiError, listOf } from '../api/client.js';
import { historyRow } from '../caja/history.js';
import { usePcMapFeed } from '../map/channel.js';
import { useSession } from '../session.js';
import { Frame } from '../ui/Frame.js';

const historySchema = listOf(shiftSummarySchema);

export function ClosingsPage() {
  const { api } = useSession();
  const { cashVersion } = usePcMapFeed();
  const [shifts, setShifts] = useState<ShiftSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Se vuelve a pedir con cada cambio en la caja: así la caja en curso y un cierre nuevo se ven.
  useEffect(() => {
    let cancelled = false;
    api.get('/shifts', historySchema).then(
      (list) => {
        if (cancelled) return;
        setShifts(list);
        setError(null);
      },
      (failure: unknown) => {
        if (!cancelled) setError(failure instanceof ApiError ? failure.message : String(failure));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, cashVersion]);

  return (
    <Frame
      title="Cierres de caja"
      tabs={<span className="muted">Un turno al día · el más reciente arriba</span>}
    >
      <div className="inventory-list">
        {error && (
          <div role="alert" className="alert-error">
            {error}
          </div>
        )}
        {shifts?.length === 0 && (
          <p className="detail-note" style={{ margin: 0 }}>
            Aún no hay cajas.
          </p>
        )}
        {shifts && shifts.length > 0 && (
          <table className="closings-table num">
            <thead>
              <tr>
                <th>Día</th>
                <th>Encargado</th>
                <th className="num-cell">Horas de PC</th>
                <th className="num-cell">Golosinas</th>
                <th className="num-cell">Otras ventas</th>
                <th className="num-cell">Total</th>
                <th className="num-cell">Diferencia</th>
                <th className="num-cell">Reportes</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((shift) => {
                const row = historyRow(shift);
                return (
                  <tr key={shift.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{row.day}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {row.hours}
                      </div>
                    </td>
                    <td style={{ color: 'var(--soft)' }}>{row.staff}</td>
                    <td className="num-cell">{row.pc}</td>
                    <td className="num-cell">{row.snacks}</td>
                    <td className="num-cell">{row.other}</td>
                    <td className="num-cell" style={{ fontWeight: 700 }}>
                      {row.total}
                    </td>
                    <td className="num-cell">
                      <span className={`closing-pill closing-pill-${row.tone}`}>
                        {row.difference}
                      </span>
                    </td>
                    <td className="num-cell" style={{ whiteSpace: 'nowrap' }}>
                      <a
                        className="btn btn-ghost closings-link"
                        href={`/shifts/${shift.id}/report.pdf`}
                        download
                      >
                        Resumen
                      </a>
                      <a
                        className="btn btn-ghost closings-link"
                        href={`/shifts/${shift.id}/report.pdf?full=1`}
                        download
                      >
                        Detallado
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Frame>
  );
}
