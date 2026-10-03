// Combos (T43, REQ-001-80, REQ-001-81): lista, alta y edición. Mientras se escribe se ve lo
// que sale la hora y el descuento frente a cada tramo de días de la tarifa. Solo el
// administrador los cambia; el resto del personal ve la lista. Los cambios no afectan a las
// horas ya vendidas.
import '../combos/combos.css';

import {
  type Combo,
  comboSchema,
  formatBolivares,
  formatDuration,
  formatMoney,
  type TariffTable,
  tariffTableSchema,
  seconds,
} from '@pope/shared';
import { type SyntheticEvent, useEffect, useState } from 'react';

import { ApiError, listOf } from '../api/client.js';
import { comboPreview, formatHoursInput, parseHours } from '../combos/model.js';
import { usePcMapFeed } from '../map/channel.js';
import { useSession, useStaff } from '../session.js';
import { Bolivares } from '../ui/Bolivares.js';
import { Frame } from '../ui/Frame.js';
import { formatUsdInput, parseUsd } from '../ui/money.js';

const combosSchema = listOf(comboSchema);

function errorMessage(failure: unknown): string {
  return failure instanceof ApiError ? failure.message : String(failure);
}

/** El combo que se edita, o `'new'` para el alta. */
type Editing = Combo | 'new' | null;

export function CombosPage() {
  const { api } = useSession();
  const staff = useStaff();
  const isAdmin = staff.role === 'administrador';
  const [combos, setCombos] = useState<Combo[] | null>(null);
  const [table, setTable] = useState<TariffTable | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get('/combos', combosSchema), api.get('/tariffs', tariffTableSchema)]).then(
      ([list, tariffs]) => {
        if (cancelled) return;
        setCombos(list);
        setTable(tariffs);
      },
      (failure: unknown) => {
        if (!cancelled) setLoadError(errorMessage(failure));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  const saved = (combo: Combo) => {
    setCombos((prev) => {
      const list = prev ?? [];
      return list.some((c) => c.id === combo.id)
        ? list.map((c) => (c.id === combo.id ? combo : c))
        : [...list, combo];
    });
    setEditing(combo);
  };

  return (
    <Frame
      title="Combos"
      actions={
        isAdmin ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEditing('new');
            }}
          >
            Nuevo combo
          </button>
        ) : (
          <span className="muted">Solo el administrador puede cambiarlos</span>
        )
      }
    >
      <div className="combos-layout">
        <div className="combos-list">
          {loadError && (
            <div role="alert" className="alert-error">
              {loadError}
            </div>
          )}
          {combos?.length === 0 && (
            <p className="detail-note" style={{ margin: 0 }}>
              Aún no hay combos.{isAdmin ? ' Crea el primero con «Nuevo combo».' : ''}
            </p>
          )}
          {combos?.map((combo) => (
            <div
              key={combo.id}
              className="card combo-row"
              data-selected={editing !== 'new' && editing?.id === combo.id}
            >
              <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <strong style={{ fontSize: 16 }}>{combo.name}</strong>
                <span className="muted num" style={{ fontSize: 13 }}>
                  {formatDuration(seconds(combo.seconds))} · {formatMoney(combo.priceMicros)} ·{' '}
                  {formatMoney(combo.ratePerHourMicros, { suffix: '/h' })}
                </span>
                <ComboBolivares combo={combo} />
              </div>
              <span className={`status-pill ${combo.active ? 'status-active' : 'status-disabled'}`}>
                {combo.active ? 'A la venta' : 'Desactivado'}
              </span>
              {isAdmin && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setEditing(combo);
                  }}
                >
                  Editar
                </button>
              )}
            </div>
          ))}
        </div>
        {isAdmin && (
          <aside
            className="side-panel"
            aria-label={editing === 'new' ? 'Nuevo combo' : 'Editar combo'}
          >
            {editing && table ? (
              <ComboEditor
                key={editing === 'new' ? 'new' : editing.id}
                combo={editing === 'new' ? null : editing}
                table={table}
                onSaved={saved}
              />
            ) : (
              <p className="detail-note" style={{ margin: 0 }}>
                Elige «Editar» en un combo para cambiarlo o desactivarlo, o crea uno con «Nuevo
                combo».
              </p>
            )}
          </aside>
        )}
      </div>
    </Frame>
  );
}

/** El precio y la hora del combo en Bs, en una línea como la de USD (REQ-005-30). */
function ComboBolivares({ combo }: { combo: Combo }) {
  const rate = usePcMapFeed().rate?.rate?.vesPerUsd;
  if (rate === undefined) return null;
  return (
    <span className="muted num" style={{ fontSize: 12 }}>
      {formatBolivares(combo.priceMicros, rate)} ·{' '}
      {formatBolivares(combo.ratePerHourMicros, rate, '/h')}
    </span>
  );
}

function ComboEditor({
  combo,
  table,
  onSaved,
}: {
  /** `null` para un combo nuevo. */
  combo: Combo | null;
  table: TariffTable;
  onSaved: (combo: Combo) => void;
}) {
  const { api } = useSession();
  const [name, setName] = useState(combo?.name ?? '');
  const [priceText, setPriceText] = useState(combo ? formatUsdInput(combo.priceMicros) : '');
  const [hoursText, setHoursText] = useState(combo ? formatHoursInput(combo.seconds) : '');
  const [active, setActive] = useState(combo?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const price = parseUsd(priceText);
  const duration = parseHours(hoursText);
  const preview = price !== null && duration !== null ? comboPreview(price, duration, table) : null;
  const trimmed = name.trim();
  const changed =
    trimmed !== combo?.name ||
    price !== combo.priceMicros ||
    duration !== combo.seconds ||
    active !== combo.active;
  const valid = trimmed !== '' && preview !== null;

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!valid || price === null || duration === null) return;
    const body = { name: trimmed, priceMicros: price, seconds: duration };
    setBusy(true);
    setError(null);
    setDone(null);
    const request = combo
      ? api.patch(`/combos/${combo.id}`, { ...body, active }, comboSchema)
      : api.post('/combos', body, comboSchema);
    request
      .then(
        (saved) => {
          setDone(combo ? 'Cambios guardados.' : 'Combo creado y a la venta.');
          onSaved(saved);
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
    <form className="combo-editor" onSubmit={submit}>
      <h2 className="detail-title">{combo ? 'Editar combo' : 'Nuevo combo'}</h2>
      <div className="field">
        <label className="label" htmlFor="combo-nombre">
          Nombre
        </label>
        <input
          id="combo-nombre"
          className="input"
          autoComplete="off"
          autoFocus={combo === null}
          maxLength={100}
          placeholder="Combo 20 horas"
          value={name}
          onChange={(event) => {
            setDone(null);
            setName(event.target.value);
          }}
        />
      </div>
      <div className="detail-grid">
        <div className="field">
          <label className="label" htmlFor="combo-precio">
            Precio (USD)
          </label>
          <input
            id="combo-precio"
            className="input num"
            inputMode="decimal"
            autoComplete="off"
            placeholder="20,00"
            value={priceText}
            onChange={(event) => {
              setDone(null);
              setPriceText(event.target.value);
            }}
          />
          {price !== null && <Bolivares amount={price} size={13} />}
        </div>
        <div className="field">
          <label className="label" htmlFor="combo-horas">
            Horas
          </label>
          <input
            id="combo-horas"
            className="input num"
            inputMode="decimal"
            autoComplete="off"
            placeholder="20"
            value={hoursText}
            onChange={(event) => {
              setDone(null);
              setHoursText(event.target.value);
            }}
          />
        </div>
      </div>
      <div className="combo-preview" aria-live="polite">
        <span className="detail-label">Con este combo la hora sale a</span>
        <span className="num" style={{ fontSize: 26 }}>
          {preview ? formatMoney(preview.rate, { suffix: '/h' }) : '—'}
        </span>
        {preview && <Bolivares amount={preview.rate} suffix="/h" size={15} />}
        {preview ? (
          preview.lines.map((line) => (
            <span key={line} style={{ color: 'var(--soft)' }}>
              {line}
            </span>
          ))
        ) : (
          <span className="field-hint">El precio y las horas deben ser mayores que cero.</span>
        )}
      </div>
      {combo && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => {
              setDone(null);
              setActive(event.target.checked);
            }}
          />
          A la venta
        </label>
      )}
      <span className="field-hint">Los cambios no afectan a las horas ya vendidas.</span>
      {error && (
        <div role="alert" className="alert-error">
          {error}
        </div>
      )}
      {done && (
        <span role="status" className="field-hint">
          {done}
        </span>
      )}
      <div style={{ flexGrow: 1 }} />
      <button
        type="submit"
        className="btn btn-primary btn-lg"
        disabled={busy || !valid || !changed}
      >
        {busy ? 'Guardando…' : combo ? 'Guardar combo' : 'Crear combo'}
      </button>
    </form>
  );
}
