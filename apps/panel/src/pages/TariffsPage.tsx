// Tarifas (T42, REQ-001-10, REQ-001-15): el precio por hora de cada día de la semana. El
// administrador elige uno o varios días y les pone el mismo precio; el resto del personal
// solo la consulta. Un cambio vale para las sesiones que empiecen después (REQ-001-16).
import '../tariffs/tariffs.css';

import { formatMoney, type TariffTable, tariffTableSchema, type Weekday } from '@pope/shared';
import { type SyntheticEvent, useEffect, useState } from 'react';

import { ApiError } from '../api/client.js';
import { useSession, useStaff } from '../session.js';
import {
  rateByWeekday,
  selectionText,
  sortedWeekdays,
  WEEKDAY_NAME,
  WEEKDAYS,
  weekdayTitle,
} from '../tariffs/model.js';
import { Bolivares } from '../ui/Bolivares.js';
import { Frame } from '../ui/Frame.js';
import { parseUsd } from '../ui/money.js';

function errorMessage(failure: unknown): string {
  return failure instanceof ApiError ? failure.message : String(failure);
}

export function TariffsPage() {
  const { api } = useSession();
  const staff = useStaff();
  const isAdmin = staff.role === 'administrador';
  const [table, setTable] = useState<TariffTable | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<Weekday>>(new Set());
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/tariffs', tariffTableSchema).then(
      (loaded) => {
        if (!cancelled) setTable(loaded);
      },
      (failure: unknown) => {
        if (!cancelled) setLoadError(errorMessage(failure));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  const rate = parseUsd(text);
  const rates = table ? rateByWeekday(table) : null;

  const toggle = (day: Weekday) => {
    setSaved(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (rate === null || selected.size === 0) return;
    const weekdays = sortedWeekdays(selected);
    setBusy(true);
    setError(null);
    setSaved(null);
    api
      .put('/tariffs', { weekdays, rateMicrosPerHour: rate }, tariffTableSchema)
      .then(
        (updated) => {
          setTable(updated);
          setSaved(
            `Guardado: ${weekdays.map((d) => WEEKDAY_NAME[d]).join(', ')} a ${formatMoney(rate, { suffix: '/h' })}.`,
          );
          setSelected(new Set());
          setText('');
        },
        (failure: unknown) => {
          setError(errorMessage(failure));
        },
      )
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <Frame
      title="Tarifas"
      actions={!isAdmin && <span className="muted">Solo el administrador puede cambiarlas</span>}
    >
      <div className="tariffs">
        <div className="tariffs-intro">
          <span style={{ color: 'var(--soft)', fontSize: 15 }}>
            {isAdmin
              ? 'Precio por hora de cada día. Elige los días y pon el mismo precio a todos.'
              : 'Precio por hora de cada día de la semana, igual para todas las PCs.'}
          </span>
          <div style={{ flexGrow: 1 }} />
          {isAdmin && table && (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setSaved(null);
                  setSelected(new Set(WEEKDAYS));
                }}
              >
                Todos
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setSelected(new Set());
                }}
              >
                Ninguno
              </button>
            </>
          )}
        </div>
        {loadError && (
          <div role="alert" className="alert-error">
            {loadError}
          </div>
        )}
        {rates && (
          <div className="tariff-days">
            {WEEKDAYS.map((day) => {
              const dayRate = rates.get(day);
              const content = (
                <>
                  <span className="tariff-day-name">{weekdayTitle(day)}</span>
                  <span>
                    <span className="num tariff-day-rate">
                      {dayRate === undefined ? '—' : formatMoney(dayRate, { suffix: '/h' })}
                    </span>
                    {dayRate !== undefined && <Bolivares amount={dayRate} suffix="/h" size={13} />}
                  </span>
                </>
              );
              return isAdmin ? (
                <button
                  key={day}
                  type="button"
                  className="tariff-day"
                  aria-pressed={selected.has(day)}
                  onClick={() => {
                    toggle(day);
                  }}
                >
                  {content}
                </button>
              ) : (
                <div key={day} className="tariff-day">
                  {content}
                </div>
              );
            })}
          </div>
        )}
        {isAdmin && rates && (
          <form className="card tariff-editor" onSubmit={submit}>
            <div className="field">
              <label className="label" htmlFor="nuevo-precio">
                Nuevo precio por hora (USD)
              </label>
              <input
                id="nuevo-precio"
                className="input amount-input"
                inputMode="decimal"
                autoComplete="off"
                placeholder="1,50"
                value={text}
                onChange={(event) => {
                  setSaved(null);
                  setText(event.target.value);
                }}
              />
            </div>
            <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ color: 'var(--soft)' }}>
                {selectionText(selected)} · se aplica a las sesiones que empiecen después de
                guardar.
              </span>
              {text.trim() !== '' && rate === null && (
                <span className="field-error">Escribe un precio mayor que cero, p. ej. 1,50.</span>
              )}
              {rate !== null && <Bolivares amount={rate} suffix="/h" size={13} />}
              {error && (
                <span role="alert" className="field-error">
                  {error}
                </span>
              )}
              {saved && (
                <span role="status" className="field-hint">
                  {saved}
                </span>
              )}
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={busy || rate === null || selected.size === 0}
            >
              {busy ? 'Guardando…' : 'Guardar tarifa'}
            </button>
          </form>
        )}
      </div>
    </Frame>
  );
}
