// Interrumpidas (T45, REQ-001-64, REQ-001-66 a REQ-001-68, REQ-001-71): las sesiones
// temporales que cortó un apagón o una caída de red con tiempo sin usar, para restaurarlas una
// vez en una PC libre sin cobrar, y el respaldo de las últimas temporales de cada PC. El dueño
// solo consulta.
import '../interrupted/interrupted.css';

import {
  formatDuration,
  formatMoney,
  interruptedSessionsSchema,
  temporaryBackupSchema,
  type TemporaryBackup,
  type TemporarySession,
  temporarySessionSchema,
  seconds,
} from '@pope/shared';
import { useCallback, useEffect, useState } from 'react';

import { ApiError } from '../api/client.js';
import {
  backupPcs,
  formatLocalMoment,
  reasonText,
  remainingText,
  restoreTargets,
} from '../interrupted/model.js';
import { useNodeNow, usePcMapFeed } from '../map/channel.js';
import { useSession, useStaff } from '../session.js';
import { Frame } from '../ui/Frame.js';

type View = 'pending' | 'backup';

function errorMessage(failure: unknown): string {
  return failure instanceof ApiError ? failure.message : String(failure);
}

export function InterruptedPage() {
  const { api } = useSession();
  const feed = usePcMapFeed();
  const now = useNodeNow(feed.skewMs);
  const [view, setView] = useState<View>('pending');
  const [pending, setPending] = useState<TemporarySession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Se vuelven a pedir cuando el nodo avisa de que cambió el número de pendientes.
  const loadPending = useCallback(() => {
    api.get('/sessions/temporary/interrupted', interruptedSessionsSchema).then(
      (response) => {
        setPending(response.sessions);
        setError(null);
      },
      (failure: unknown) => {
        setError(errorMessage(failure));
      },
    );
  }, [api]);

  useEffect(() => {
    loadPending();
  }, [loadPending, feed.pendingInterrupted]);

  const tab = (value: View, label: string) => (
    <button
      type="button"
      className="section-tab"
      aria-pressed={view === value}
      onClick={() => {
        setView(value);
      }}
    >
      {label}
    </button>
  );

  return (
    <Frame
      title="Interrumpidas"
      tabs={
        <div style={{ display: 'flex', gap: 4 }}>
          {tab('pending', `Pendientes · ${String(pending?.length ?? 0)}`)}
          {tab('backup', 'Respaldo por PC')}
        </div>
      }
    >
      <div className="interrupted">
        {error && (
          <div role="alert" className="alert-error">
            {error}
          </div>
        )}
        {view === 'pending' ? (
          <PendingList sessions={pending} now={now} onRestored={loadPending} />
        ) : (
          <BackupView now={now} />
        )}
      </div>
    </Frame>
  );
}

function PendingList({
  sessions,
  now,
  onRestored,
}: {
  sessions: TemporarySession[] | null;
  now: Date;
  onRestored: () => void;
}) {
  const staff = useStaff();
  const canRestore = staff.role !== 'dueno';
  const [restoringId, setRestoringId] = useState<string | null>(null);

  return (
    <>
      <p className="detail-note" style={{ margin: 0 }}>
        Sesiones temporales que cortó un apagón o una caída de red con tiempo sin usar. Se pueden
        restaurar una sola vez, en cualquier PC libre, hasta 48 h después del corte.
      </p>
      {sessions?.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          No hay sesiones interrumpidas pendientes.
        </p>
      )}
      {sessions?.map((session) => (
        <PendingCard
          key={session.id}
          session={session}
          now={now}
          canRestore={canRestore}
          open={restoringId === session.id}
          onOpen={() => {
            setRestoringId(session.id);
          }}
          onCancel={() => {
            setRestoringId(null);
          }}
          onRestored={() => {
            setRestoringId(null);
            onRestored();
          }}
        />
      ))}
    </>
  );
}

function PendingCard({
  session,
  now,
  canRestore,
  open,
  onOpen,
  onCancel,
  onRestored,
}: {
  session: TemporarySession;
  now: Date;
  canRestore: boolean;
  open: boolean;
  onOpen: () => void;
  onCancel: () => void;
  onRestored: () => void;
}) {
  const { api } = useSession();
  const feed = usePcMapFeed();
  const targets = restoreTargets(feed.map?.pcs ?? []);
  // Si la PC original está libre, se propone esa.
  const [targetId, setTargetId] = useState<string | null>(null);
  const chosen =
    targets.find((pc) => pc.id === targetId) ??
    targets.find((pc) => pc.id === session.pc.id) ??
    targets[0] ??
    null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const interruption = session.interruption;

  const restore = () => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    api
      .post(`/sessions/${session.id}/restore`, { pcId: chosen.id }, temporarySessionSchema)
      .then(onRestored, (failure: unknown) => {
        setBusy(false);
        setError(errorMessage(failure));
      });
  };

  return (
    <div className="card interrupted-card">
      <div className="interrupted-row">
        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <strong style={{ fontSize: 17 }}>{session.name}</strong>
          <span className="muted">
            {session.pc.name} · cortada a las{' '}
            {interruption ? formatLocalMoment(new Date(interruption.interruptedAt), now) : '—'} ·
            abierta por {session.openedBy}
          </span>
        </div>
        <div className="interrupted-figure">
          <span className="detail-label">Le quedaban</span>
          <span className="num" style={{ fontSize: 20 }}>
            {remainingText(session.remainingSeconds)}
          </span>
        </div>
        <div className="interrupted-figure">
          <span className="detail-label">Se puede hasta</span>
          <span className="num" style={{ fontSize: 20 }}>
            {interruption ? formatLocalMoment(new Date(interruption.expiresAt), now) : '—'}
          </span>
        </div>
        {canRestore && !open && (
          <button type="button" className="btn btn-primary" onClick={onOpen}>
            Restaurar
          </button>
        )}
      </div>
      {open && (
        <>
          <div className="interrupted-targets">
            <span style={{ fontWeight: 700 }}>¿En qué PC libre?</span>
            {targets.length === 0 && (
              <span className="muted">No hay ninguna PC libre y conectada ahora mismo.</span>
            )}
            {targets.map((pc) => (
              <button
                key={pc.id}
                type="button"
                className="chip"
                aria-pressed={pc.id === chosen?.id}
                onClick={() => {
                  setTargetId(pc.id);
                }}
              >
                {pc.name}
              </button>
            ))}
            <div style={{ flexGrow: 1 }} />
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !chosen}
              onClick={restore}
            >
              {busy ? 'Restaurando…' : chosen ? `Restaurar en ${chosen.name}` : 'Restaurar'}
            </button>
          </div>
          <span className="field-hint">
            Sin cobro nuevo: la sesión sigue con el tiempo que le quedaba y queda enlazada a la
            original.
          </span>
          {error && (
            <div role="alert" className="alert-error">
              {error}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BackupView({ now }: { now: Date }) {
  const { api } = useSession();
  const [backup, setBackup] = useState<TemporaryBackup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pcId, setPcId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/sessions/temporary/backup', temporaryBackupSchema).then(
      (loaded) => {
        if (!cancelled) setBackup(loaded);
      },
      (failure: unknown) => {
        if (!cancelled) setError(errorMessage(failure));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (error) {
    return (
      <div role="alert" className="alert-error">
        {error}
      </div>
    );
  }
  if (!backup) return <span className="muted">Cargando el respaldo…</span>;

  const pcs = backupPcs(backup.sessions);
  const current = pcs.find((pc) => pc.id === pcId) ?? pcs[0] ?? null;
  const rows = backup.sessions.filter((session) => session.pc.id === current?.id);

  if (!current) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        Aún no hay sesiones temporales en el respaldo.
      </p>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <label className="label" htmlFor="respaldo-pc">
          PC
        </label>
        <select
          id="respaldo-pc"
          className="input"
          style={{ width: 160 }}
          value={current.id}
          onChange={(event) => {
            setPcId(event.target.value);
          }}
        >
          {pcs.map((pc) => (
            <option key={pc.id} value={pc.id}>
              {pc.name}
            </option>
          ))}
        </select>
        <span className="muted">
          Últimas {backup.keptPerPc} sesiones temporales de la PC (el administrador puede guardar
          más), y las interrumpidas aún pendientes.
        </span>
      </div>
      <table className="backup-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th className="col-num">Pagado</th>
            <th className="col-num">Restante</th>
            <th className="col-num">Importe</th>
            <th>Abierta por</th>
            <th>Inicio</th>
            <th>Fin</th>
            <th>Motivo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((session) => (
            <tr key={session.id}>
              <td style={{ fontWeight: 700 }}>{session.name}</td>
              <td className="num col-num">{formatDuration(seconds(session.purchasedSeconds))}</td>
              <td className="num col-num">{formatDuration(seconds(session.remainingSeconds))}</td>
              <td className="num col-num">{formatMoney(session.amountMicros)}</td>
              <td>{session.openedBy}</td>
              <td className="num">{formatLocalMoment(new Date(session.startedAt), now)}</td>
              <td className="num">
                {session.endedAt ? formatLocalMoment(new Date(session.endedAt), now) : '—'}
              </td>
              <td>{reasonText(session, now)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
