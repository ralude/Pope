// Personal (T43b, REQ-001-40): lista, alta y activar o desactivar. Solo el administrador.
// Cada persona tiene su usuario; no se comparten. Al desactivar a alguien, el nodo cierra su
// sesión en el panel. Nadie se desactiva a sí mismo desde aquí (decidido por el mantenedor).
import '../customers/customers.css';

import { type StaffListItem, staffListItemSchema, type StaffRole } from '@pope/shared';
import { type SyntheticEvent, useEffect, useState } from 'react';

import { ApiError, type FieldIssue, listOf } from '../api/client.js';
import { useSession, useStaff } from '../session.js';
import { Frame } from '../ui/Frame.js';

const staffListSchema = listOf(staffListItemSchema);

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  encargado: 'Encargado',
  administrador: 'Administrador',
  dueno: 'Dueño (solo lectura)',
};

const ROLES: readonly StaffRole[] = ['encargado', 'administrador', 'dueno'];

function errorMessage(failure: unknown): string {
  return failure instanceof ApiError ? failure.message : String(failure);
}

export function StaffPage() {
  const { api } = useSession();
  const me = useStaff();
  const [members, setMembers] = useState<StaffListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/staff', staffListSchema).then(
      (list) => {
        if (!cancelled) setMembers(list);
      },
      (failure: unknown) => {
        if (!cancelled) setError(errorMessage(failure));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  const replace = (member: StaffListItem) => {
    setMembers((prev) => {
      const list = prev ?? [];
      return list.some((m) => m.id === member.id)
        ? list.map((m) => (m.id === member.id ? member : m))
        : [...list, member];
    });
  };

  const setActive = (member: StaffListItem, active: boolean) => {
    setBusyId(member.id);
    setError(null);
    api
      .patch(`/staff/${member.id}/status`, { active }, staffListItemSchema)
      .then(replace, (failure: unknown) => {
        setError(errorMessage(failure));
      })
      .finally(() => {
        setBusyId(null);
      });
  };

  return (
    <Frame title="Personal" actions={<span className="muted">Solo el administrador</span>}>
      <div className="customers-layout">
        <div className="customers-list">
          {error && (
            <div role="alert" className="alert-error" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}
          <table className="customers-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Nombre</th>
                <th>Rol</th>
                <th className="col-status">Estado</th>
                <th>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members?.map((member) => (
                <tr key={member.id} className="static-row">
                  <td style={{ fontWeight: 700 }}>{member.username}</td>
                  <td style={{ color: 'var(--soft)' }}>{member.displayName}</td>
                  <td>{STAFF_ROLE_LABEL[member.role]}</td>
                  <td>
                    <span
                      className={`status-pill ${member.active ? 'status-active' : 'status-disabled'}`}
                    >
                      {member.active ? 'Activo' : 'Desactivado'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {member.id === me.id ? (
                      <span className="muted">Eres tú</span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busyId === member.id}
                        onClick={() => {
                          setActive(member, !member.active);
                        }}
                      >
                        {member.active ? 'Desactivar' : 'Activar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <aside className="side-panel" aria-label="Nuevo miembro del personal">
          <NewStaffForm onCreated={replace} />
        </aside>
      </div>
    </Frame>
  );
}

const CREATE_FIELDS = ['username', 'displayName', 'role', 'password'];

function NewStaffForm({ onCreated }: { onCreated: (member: StaffListItem) => void }) {
  const { api } = useSession();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<StaffRole>('encargado');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [done, setDone] = useState<string | null>(null);

  const issueFor = (path: string) => issues.find((issue) => issue.path === path)?.message;

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setIssues([]);
    setDone(null);
    api
      .post(
        '/staff',
        { username: username.trim(), displayName: displayName.trim(), role, password },
        staffListItemSchema,
      )
      .then(
        (member) => {
          onCreated(member);
          setDone(`${member.displayName} ya puede entrar con el usuario ${member.username}.`);
          setUsername('');
          setDisplayName('');
          setRole('encargado');
          setPassword('');
        },
        (failure: unknown) => {
          setError(errorMessage(failure));
          if (failure instanceof ApiError) setIssues(failure.issues);
        },
      )
      .finally(() => {
        setBusy(false);
      });
  };

  const fieldError = (path: string) => {
    const message = issueFor(path);
    return message ? <span className="field-error">{message}</span> : null;
  };

  return (
    <form
      style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}
      onSubmit={submit}
    >
      <h2 className="detail-title">Nuevo miembro</h2>
      <div className="field">
        <label className="label" htmlFor="personal-usuario">
          Usuario
        </label>
        <input
          id="personal-usuario"
          className="input"
          autoComplete="off"
          required
          maxLength={64}
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
          }}
        />
        {fieldError('username')}
      </div>
      <div className="field">
        <label className="label" htmlFor="personal-nombre">
          Nombre para mostrar
        </label>
        <input
          id="personal-nombre"
          className="input"
          autoComplete="off"
          required
          maxLength={100}
          value={displayName}
          onChange={(event) => {
            setDisplayName(event.target.value);
          }}
        />
        {fieldError('displayName')}
      </div>
      <div className="field">
        <label className="label" htmlFor="personal-rol">
          Rol
        </label>
        <select
          id="personal-rol"
          className="input"
          value={role}
          onChange={(event) => {
            const next = ROLES.find((value) => value === event.target.value);
            if (next) setRole(next);
          }}
        >
          {ROLES.map((value) => (
            <option key={value} value={value}>
              {STAFF_ROLE_LABEL[value]}
            </option>
          ))}
        </select>
        {fieldError('role')}
      </div>
      <div className="field">
        <label className="label" htmlFor="personal-clave">
          Contraseña
        </label>
        <input
          id="personal-clave"
          className="input"
          type="password"
          autoComplete="new-password"
          required
          maxLength={256}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
        {fieldError('password')}
      </div>
      <span className="field-hint">
        Cada persona tiene su propio usuario; no se comparten. Al desactivar a alguien, se cierra su
        sesión en el panel.
      </span>
      {error && !issues.some((issue) => CREATE_FIELDS.includes(issue.path)) && (
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
      <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
        {busy ? 'Creando…' : 'Crear'}
      </button>
    </form>
  );
}
