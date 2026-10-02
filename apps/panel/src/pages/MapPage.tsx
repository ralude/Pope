// Mapa de PCs en vivo (T39, REQ-001-31): baldosas por estado, leyenda con recuentos y el
// detalle de la PC elegida. Los datos llegan por el canal `/panel`; entre envíos, el restante
// se cuenta aquí con el reloj del nodo. El administrador lo organiza en la pestaña
// «Organizar» (T39b, REQ-001-45).
import '../map/map.css';

import {
  formatDuration,
  formatLocalTime,
  formatMoney,
  type PcMap,
  type PcMapItem,
  seconds,
} from '@pope/shared';
import { type ReactNode, type SyntheticEvent, useCallback, useState } from 'react';

import { ApiError } from '../api/client.js';
import { useNodeNow, usePcMapFeed } from '../map/channel.js';
import {
  type Cell,
  ENDING_SECONDS,
  type Layout,
  layoutOf,
  type Legend,
  legendOf,
  liveAccount,
  liveRemaining,
  MAP_COLUMNS,
  MIN_ROWS,
  movedCount,
  moveTo,
  organizeRows,
  placePcs,
  shortDuration,
  type TileKind,
  tileKind,
  tileLabel,
  withLayout,
} from '../map/model.js';
import { OrganizeGrid } from '../map/OrganizeGrid.js';
import { useSession, useStaff } from '../session.js';
import { Dialog } from '../ui/Dialog.js';
import { Frame } from '../ui/Frame.js';

const KIND_LABEL: Record<TileKind, string> = {
  account: 'Con cuenta',
  temporary: 'Temporal',
  free: 'Libre',
  offline: 'Sin conexión',
};

type Mode = 'operate' | 'organize';

/**
 * Distribución en edición. Tras guardarla, `savedWith` es el mapa que había entonces: en
 * cuanto llega uno nuevo por el canal (ya con lo guardado), se deja de mostrar la edición.
 */
interface Edit {
  layout: Layout;
  savedWith: PcMap | null;
}

export function MapPage() {
  const staff = useStaff();
  const { api } = useSession();
  const feed = usePcMapFeed();
  const now = useNodeNow(feed.skewMs);
  const [mode, setMode] = useState<Mode>('operate');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const pcs = feed.map?.pcs ?? [];
  const legend = legendOf(pcs, now);
  const selected = pcs.find((pc) => pc.id === selectedId) ?? null;
  const isAdmin = staff.role === 'administrador';
  const organizing = isAdmin && mode === 'organize';

  const draft =
    edit && (edit.savedWith === null || edit.savedWith === feed.map) ? edit.layout : null;
  const serverPlaced = placePcs(pcs);
  const organizePlaced = placePcs(withLayout(pcs, draft));
  const moved = edit?.savedWith === null ? movedCount(serverPlaced, layoutOf(organizePlaced)) : 0;

  const move = (pcId: string, target: Cell) => {
    setSaveError(null);
    setEdit({ layout: moveTo(layoutOf(organizePlaced), pcId, target), savedWith: null });
  };

  const save = () => {
    const layout = layoutOf(organizePlaced);
    const savedWith = feed.map;
    setSaving(true);
    setSaveError(null);
    api
      .send('PUT', '/pcs/map', {
        positions: organizePlaced.map(({ pc, row, col }) => ({ pcId: pc.id, row, col })),
      })
      .then(
        () => {
          setEdit({ layout, savedWith });
        },
        (failure: unknown) => {
          setSaveError(failure instanceof ApiError ? failure.message : String(failure));
        },
      )
      .finally(() => {
        setSaving(false);
      });
  };

  const tab = (value: Mode, label: string) => (
    <button
      type="button"
      className="section-tab"
      aria-pressed={mode === value}
      onClick={() => {
        setMode(value);
      }}
    >
      {label}
    </button>
  );

  return (
    <Frame
      title="Mapa"
      tabs={
        isAdmin && (
          <div style={{ display: 'flex', gap: 4 }}>
            {tab('operate', 'Operar')}
            {tab('organize', 'Organizar')}
          </div>
        )
      }
      actions={
        <>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: 40, padding: 0 }}
            aria-label="Leyenda de estados"
            title="Leyenda de estados"
            aria-pressed={legendOpen}
            onClick={() => {
              setLegendOpen((open) => !open);
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M7 5h10M7 10h10M7 15h10M3 5h.5M3 10h.5M3 15h.5" />
            </svg>
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Ocupación
            </span>
            <span className="num" style={{ fontSize: 24, lineHeight: 1.1 }}>
              {legend.occupied}/{legend.total}
            </span>
          </div>
        </>
      }
    >
      <div className="map-layout">
        <div className="map-area">
          {!feed.live && (
            <div role="status" className="alert-error map-banner">
              {feed.map
                ? 'Sin conexión con el nodo: el mapa puede no estar al día. Reconectando…'
                : 'Conectando con el nodo…'}
            </div>
          )}
          {organizing ? (
            <OrganizeGrid
              placed={organizePlaced}
              rows={organizeRows(organizePlaced)}
              onMove={move}
            />
          ) : (
            <MapGrid pcs={pcs} now={now} selectedId={selectedId} onSelect={setSelectedId} />
          )}
          {legendOpen && <LegendCard legend={legend} />}
        </div>
        <aside
          className="side-panel"
          aria-label={organizing ? 'Organizar el mapa' : 'Detalle de la PC'}
        >
          {organizing ? (
            <OrganizePanel
              moved={moved}
              saving={saving}
              error={saveError}
              onSave={save}
              onDiscard={() => {
                setEdit(null);
                setSaveError(null);
              }}
            />
          ) : selected ? (
            <PcDetail key={selected.id} pc={selected} now={now} />
          ) : (
            <p className="detail-note" style={{ margin: 0 }}>
              Elige una PC del mapa para ver quién la usa, cuánto le queda y qué puedes hacer.
            </p>
          )}
        </aside>
      </div>
    </Frame>
  );
}

function MapGrid({
  pcs,
  now,
  selectedId,
  onSelect,
}: {
  pcs: readonly PcMapItem[];
  now: Date;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const placed = placePcs(pcs);
  const rows = Math.max(MIN_ROWS, ...placed.map((p) => p.row + 1));
  return (
    <div
      className="map-grid"
      style={{
        gridTemplateColumns: `repeat(${String(MAP_COLUMNS)}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${String(rows)}, 96px)`,
      }}
    >
      {placed.map(({ pc, row, col }) => {
        const kind = tileKind(pc);
        const remaining = pc.session ? liveRemaining(pc.session, pc.connected, now) : null;
        const ending = remaining !== null && remaining <= ENDING_SECONDS;
        const parts = [pc.name, KIND_LABEL[kind]];
        if (pc.session && remaining !== null) {
          parts.push(pc.session.who, `quedan ${formatDuration(seconds(remaining))}`);
          if (!pc.connected) parts.push('sin conexión');
        }
        return (
          <div key={pc.id} className="map-cell" style={{ gridRow: row + 1, gridColumn: col + 1 }}>
            <button
              type="button"
              className={`tile tile-${kind}${pc.session && !pc.connected ? ' tile-unlinked' : ''}`}
              aria-label={parts.join(', ')}
              aria-pressed={pc.id === selectedId}
              onClick={() => {
                onSelect(pc.id);
              }}
            >
              {tileLabel(pc.name)}
            </button>
            <div className={`tile-bar ${ending ? 'bar-ending' : `bar-${kind}`}`} />
            <div className="tile-sub num">{remaining === null ? '' : shortDuration(remaining)}</div>
          </div>
        );
      })}
    </div>
  );
}

function OrganizePanel({
  moved,
  saving,
  error,
  onSave,
  onDiscard,
}: {
  moved: number;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <>
      <h2 className="detail-title">Organizar el mapa</h2>
      <p className="detail-note" style={{ margin: 0 }}>
        Arrastra cada PC a su sitio real en el local. Si la sueltas sobre otra, se intercambian. Las
        casillas vacías son pasillos o paredes.
      </p>
      <p className="detail-note" style={{ margin: 0 }}>
        Con el teclado: elige la PC con Tab, tómala con Espacio, llévala con las flechas y suéltala
        con Espacio. Escape cancela.
      </p>
      <p className="muted" role="status" style={{ margin: 0 }}>
        {moved === 0
          ? 'Sin cambios por guardar.'
          : `${String(moved)} ${moved === 1 ? 'PC cambiada' : 'PCs cambiadas'} de sitio, sin guardar.`}
      </p>
      {error && (
        <div role="alert" className="alert-error">
          {error}
        </div>
      )}
      <div style={{ flexGrow: 1 }} />
      <button
        type="button"
        className="btn btn-primary btn-lg"
        disabled={moved === 0 || saving}
        onClick={onSave}
      >
        {saving ? 'Guardando…' : 'Guardar distribución'}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-lg"
        disabled={moved === 0 || saving}
        onClick={onDiscard}
      >
        Descartar cambios
      </button>
    </>
  );
}

function LegendCard({ legend }: { legend: Legend }) {
  const rows: { label: string; count: number; swatch: string; style?: object }[] = [
    { label: KIND_LABEL.account, count: legend.account, swatch: 'swatch-account' },
    { label: KIND_LABEL.temporary, count: legend.temporary, swatch: 'swatch-temporary' },
    { label: KIND_LABEL.free, count: legend.free, swatch: 'swatch-free' },
    {
      label: 'Quedan menos de 5 min',
      count: legend.ending,
      swatch: 'bar-ending',
      style: { height: 5, borderRadius: 3 },
    },
    { label: KIND_LABEL.offline, count: legend.offline, swatch: 'swatch-offline' },
  ];
  return (
    <div className="card map-legend" aria-label="Leyenda">
      {rows.map((row) => (
        <div key={row.label} className="legend-row">
          <div className={`legend-swatch ${row.swatch}`} style={row.style} />
          <span style={{ flexGrow: 1 }}>{row.label}</span>
          <span className="num" style={{ color: 'var(--soft)' }}>
            {row.count}
          </span>
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail-field">
      <span className="detail-label">{label}</span>
      <span className="num">{children}</span>
    </div>
  );
}

function PcDetail({ pc, now }: { pc: PcMapItem; now: Date }) {
  const staff = useStaff();
  // Sesión que se está cerrando: si termina sola y la PC abre otra, el diálogo no reaparece.
  const [closingId, setClosingId] = useState<string | null>(null);
  const stopClosing = useCallback(() => {
    setClosingId(null);
  }, []);
  const kind = tileKind(pc);
  const session = pc.session;
  const remaining = session ? liveRemaining(session, pc.connected, now) : 0;
  const ending = session !== null && remaining <= ENDING_SECONDS;
  const canOperate = staff.role !== 'dueno';

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 className="detail-title">{pc.name}</h2>
        <span className={`detail-badge ${ending ? 'badge-ending' : `badge-${kind}`}`}>
          {ending ? 'Quedan < 5 min' : KIND_LABEL[kind]}
        </span>
      </div>

      {session && (
        <>
          <Field label={session.kind === 'account' ? 'Cliente' : 'Sesión temporal'}>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{session.who}</span>
          </Field>
          <Field label="Tiempo restante">
            <span className="detail-time">{formatDuration(seconds(remaining))}</span>
          </Field>
          <div className="detail-grid">
            {session.kind === 'account' ? (
              <AccountBalance pc={pc} now={now} />
            ) : (
              <Field label="Cobrado">{formatMoney(session.amountMicros)}</Field>
            )}
            <Field label="Desde">{formatLocalTime(new Date(session.startedAt))}</Field>
            <Field label="Abierta por">{session.openedBy}</Field>
            <Field label="Tarifa">{formatMoney(session.rateMicrosPerHour, { suffix: '/h' })}</Field>
          </div>
          {!pc.connected && (
            <p className="detail-note" style={{ margin: 0 }}>
              La PC no está conectada al nodo. La sesión sigue abierta y el tiempo no corre mientras
              tanto.
            </p>
          )}
        </>
      )}
      {kind === 'free' && (
        <p className="detail-note" style={{ margin: 0 }}>
          Libre y conectada. El cliente puede entrar con su cuenta desde la PC.
        </p>
      )}
      {kind === 'offline' && (
        <p className="detail-note" style={{ margin: 0 }}>
          La PC no está conectada al nodo. Revisa que esté encendida y con el cable de red puesto.
        </p>
      )}

      <div style={{ flexGrow: 1 }} />
      {session && canOperate && (
        <button
          type="button"
          className="btn btn-danger btn-lg"
          onClick={() => {
            setClosingId(session.sessionId);
          }}
        >
          Cerrar sesión
        </button>
      )}
      {session?.sessionId === closingId && (
        <CloseSessionDialog
          pcName={pc.name}
          who={session.who}
          sessionId={session.sessionId}
          onDone={stopClosing}
        />
      )}
    </>
  );
}

function AccountBalance({ pc, now }: { pc: PcMapItem; now: Date }) {
  if (!pc.session) return null;
  const live = liveAccount(pc.session, pc.connected, now);
  return (
    <Field label="Saldo">
      {formatMoney(live.moneyMicros)}
      {live.comboSeconds > 0 && (
        <span className="muted" style={{ display: 'block', fontSize: 13 }}>
          + {formatDuration(live.comboSeconds)} de combo
        </span>
      )}
    </Field>
  );
}

/**
 * Confirmación antes de cerrar una sesión (REQ-001-26): se cobra hasta este momento y la PC
 * se bloquea. Diálogo propio, sin `confirm()` del navegador.
 */
function CloseSessionDialog({
  pcName,
  who,
  sessionId,
  onDone,
}: {
  pcName: string;
  who: string;
  sessionId: string;
  onDone: () => void;
}) {
  const { api } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    api.send('POST', `/sessions/${sessionId}/close`).then(onDone, (failure: unknown) => {
      setBusy(false);
      setError(failure instanceof ApiError ? failure.message : String(failure));
    });
  };

  return (
    <Dialog title={`Cerrar la sesión de ${pcName}`} onClose={onDone} onSubmit={submit}>
      <p className="detail-note" style={{ margin: 0 }}>
        Se cobra a <strong>{who}</strong> hasta este momento y la PC se bloquea.
      </p>
      {error && (
        <div role="alert" className="alert-error">
          {error}
        </div>
      )}
      <div className="dialog-actions">
        <button autoFocus type="button" className="btn btn-ghost" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-danger" disabled={busy}>
          {busy ? 'Cerrando…' : 'Cerrar sesión'}
        </button>
      </div>
    </Dialog>
  );
}
