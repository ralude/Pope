// Clientes (T40, REQ-001-01, REQ-001-02, REQ-001-04): lista con buscador, alta de cliente,
// bloqueo o desactivación y quitar el bloqueo por intentos (REQ-001-52). Las cuentas solo se
// crean aquí, en el nodo local; la PC nunca las crea. El dueño solo consulta.
import '../customers/customers.css';

import {
  type Customer,
  customerPageSchema,
  customerSchema,
  type CustomerStatus,
  formatDuration,
  formatMoney,
  seconds,
} from '@pope/shared';
import {
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { ApiError, type FieldIssue } from '../api/client.js';
import { ComboSaleDialog } from '../customers/ComboSaleDialog.js';
import {
  BADGE_LABEL,
  customerBadge,
  formatPhone,
  isLoginLocked,
  lockNotice,
  replaceCustomer,
  searchPath,
  statusActions,
} from '../customers/model.js';
import { RechargeDialog } from '../customers/RechargeDialog.js';
import { useSession, useStaff } from '../session.js';
import { Bolivares } from '../ui/Bolivares.js';
import { Dialog } from '../ui/Dialog.js';
import { Frame } from '../ui/Frame.js';

/** Espera tras la última tecla antes de buscar, para no pedir una página por letra. */
const SEARCH_DELAY_MS = 250;

function errorMessage(failure: unknown): string {
  return failure instanceof ApiError ? failure.message : String(failure);
}

/** Hora actual, refrescada cada 15 s: basta para ver cuándo termina un bloqueo por intentos. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 15_000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return now;
}

interface ListState {
  items: Customer[];
  total: number;
  loading: boolean;
  error: string | null;
}

export function CustomersPage() {
  const { api } = useSession();
  const staff = useStaff();
  const now = useNow();
  const canOperate = staff.role !== 'dueno';
  const [query, setQuery] = useState('');
  const [list, setList] = useState<ListState>({
    items: [],
    total: 0,
    loading: true,
    error: null,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Cada búsqueda tiene un número; una respuesta de una búsqueda anterior se descarta.
  const searchSeq = useRef(0);

  const load = useCallback(
    (text: string, offset: number) => {
      const seq = ++searchSeq.current;
      setList((prev) => ({ ...prev, loading: true, error: null }));
      api.get(searchPath(text, offset), customerPageSchema).then(
        (page) => {
          if (seq !== searchSeq.current) return;
          setList((prev) => ({
            items: offset === 0 ? page.items : [...prev.items, ...page.items],
            total: page.total,
            loading: false,
            error: null,
          }));
        },
        (failure: unknown) => {
          if (seq !== searchSeq.current) return;
          setList((prev) => ({ ...prev, loading: false, error: errorMessage(failure) }));
        },
      );
    },
    [api],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      load(query, 0);
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [query, load]);

  const update = useCallback((customer: Customer) => {
    setList((prev) => ({ ...prev, items: replaceCustomer(prev.items, customer) }));
  }, []);

  // Al elegir un cliente se piden sus datos al día (los saldos cambian con las sesiones).
  const select = (id: string) => {
    setSelectedId(id);
    api.get(`/customers/${id}`, customerSchema).then(update, () => {
      // Se queda con lo de la lista; el error ya se verá al operar.
    });
  };

  const created = (customer: Customer) => {
    setCreating(false);
    setList((prev) => ({ ...prev, items: [customer, ...prev.items], total: prev.total + 1 }));
    setSelectedId(customer.id);
  };

  const closeCreate = useCallback(() => {
    setCreating(false);
  }, []);

  const selected = list.items.find((customer) => customer.id === selectedId) ?? null;

  return (
    <Frame
      title="Clientes"
      tabs={
        <>
          <label htmlFor="buscar-cliente" className="sr-only">
            Buscar cliente
          </label>
          <input
            id="buscar-cliente"
            type="search"
            className="input customers-search"
            placeholder="Buscar por usuario, nombre o teléfono"
            autoComplete="off"
            maxLength={100}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        </>
      }
      actions={
        canOperate && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setCreating(true);
            }}
          >
            Nuevo cliente
          </button>
        )
      }
    >
      <div className="customers-layout">
        <div className="customers-list">
          {list.error && (
            <div role="alert" className="alert-error" style={{ marginBottom: 16 }}>
              {list.error}
            </div>
          )}
          <table className="customers-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th className="col-num">Saldo</th>
                <th className="col-num">Horas de combo</th>
                <th className="col-status">Estado</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((customer) => {
                const badge = customerBadge(customer, now);
                return (
                  <tr
                    key={customer.id}
                    aria-selected={customer.id === selectedId}
                    onClick={() => {
                      select(customer.id);
                    }}
                  >
                    <td>
                      <button
                        type="button"
                        className="customer-pick"
                        onClick={(event) => {
                          event.stopPropagation();
                          select(customer.id);
                        }}
                      >
                        {customer.username}
                      </button>
                    </td>
                    <td style={{ color: 'var(--soft)' }}>{customer.name ?? '—'}</td>
                    <td className="num" style={{ color: 'var(--soft)' }}>
                      {customer.phone ? formatPhone(customer.phone) : '—'}
                    </td>
                    <td className="num col-num">
                      {formatMoney(customer.balances.moneyMicros)}
                      <Bolivares amount={customer.balances.moneyMicros} size={11} />
                    </td>
                    <td className="num col-num">
                      {formatDuration(seconds(customer.balances.comboSeconds))}
                    </td>
                    <td>
                      <span className={`status-pill status-${badge}`}>{BADGE_LABEL[badge]}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="customers-footer">
            <span className="muted" role="status">
              {listSummary(list, query)}
            </span>
            {list.items.length < list.total && (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={list.loading}
                onClick={() => {
                  load(query, list.items.length);
                }}
              >
                Ver más
              </button>
            )}
          </div>
        </div>
        <aside className="side-panel" aria-label="Cliente seleccionado">
          {selected ? (
            <CustomerDetail
              key={selected.id}
              customer={selected}
              now={now}
              canOperate={canOperate}
              onChange={update}
            />
          ) : (
            <p className="detail-note" style={{ margin: 0 }}>
              Elige un cliente de la lista para ver su saldo y cambiar el estado de su cuenta.
            </p>
          )}
        </aside>
      </div>
      {creating && <NewCustomerDialog onClose={closeCreate} onCreated={created} />}
    </Frame>
  );
}

function listSummary(list: ListState, query: string): string {
  if (list.loading && list.items.length === 0) return 'Buscando…';
  if (list.total === 0) {
    return query.trim() ? 'Ningún cliente coincide con la búsqueda.' : 'Aún no hay clientes.';
  }
  const noun = list.total === 1 ? 'cliente' : 'clientes';
  return list.items.length < list.total
    ? `${String(list.items.length)} de ${String(list.total)} ${noun}`
    : `${String(list.total)} ${noun}`;
}

function CustomerDetail({
  customer,
  now,
  canOperate,
  onChange,
}: {
  customer: Customer;
  now: Date;
  canOperate: boolean;
  onChange: (customer: Customer) => void;
}) {
  const { api } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'recharge' | 'combo' | null>(null);
  const closeDialog = useCallback(() => {
    setDialog(null);
  }, []);
  const charged = (updated: Customer) => {
    setDialog(null);
    onChange(updated);
  };
  const badge = customerBadge(customer, now);
  const locked = isLoginLocked(customer, now);
  const contact = [customer.name, customer.phone && formatPhone(customer.phone)].filter(Boolean);

  const run = (request: Promise<Customer>) => {
    setBusy(true);
    setError(null);
    request
      .then(onChange, (failure: unknown) => {
        setError(errorMessage(failure));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const setStatus = (status: CustomerStatus) => {
    run(api.patch(`/customers/${customer.id}/status`, { status }, customerSchema));
  };

  const unlock = () => {
    run(api.post(`/customers/${customer.id}/unlock`, undefined, customerSchema));
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <h2 className="detail-title">{customer.username}</h2>
        <span style={{ color: 'var(--soft)' }}>
          {contact.length > 0 ? contact.join(' · ') : 'Sin nombre ni teléfono'}
        </span>
      </div>
      <div className="detail-grid">
        <div className="balance-card">
          <span className="detail-label">Saldo</span>
          <span className="num balance-value">{formatMoney(customer.balances.moneyMicros)}</span>
          <Bolivares amount={customer.balances.moneyMicros} size={13} />
        </div>
        <div className="balance-card">
          <span className="detail-label">Horas de combo</span>
          <span className="num balance-value">
            {formatDuration(seconds(customer.balances.comboSeconds))}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="detail-label">Estado</span>
        <span className={`status-pill status-${badge}`}>{BADGE_LABEL[badge]}</span>
      </div>
      {customer.status !== 'active' && (
        <p className="detail-note" style={{ margin: 0 }}>
          No puede iniciar sesión ni recibir recargas. Su saldo se conserva.
        </p>
      )}
      {locked && (
        <div className="lock-box">
          <span>{lockNotice(customer)}</span>
          {canOperate && (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={unlock}>
              Quitar el bloqueo ahora
            </button>
          )}
        </div>
      )}
      {error && (
        <div role="alert" className="alert-error">
          {error}
        </div>
      )}
      <div style={{ flexGrow: 1 }} />
      {canOperate && customer.status === 'active' && (
        <>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => {
              setDialog('recharge');
            }}
          >
            Recargar saldo
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-lg"
            onClick={() => {
              setDialog('combo');
            }}
          >
            Vender combo
          </button>
        </>
      )}
      {dialog === 'recharge' && (
        <RechargeDialog
          customer={customer}
          balances={customer.balances}
          onClose={closeDialog}
          onDone={charged}
        />
      )}
      {dialog === 'combo' && (
        <ComboSaleDialog
          customer={customer}
          balances={customer.balances}
          onClose={closeDialog}
          onDone={charged}
        />
      )}
      {canOperate && (
        <div className="detail-grid" style={{ gap: 8 }}>
          {statusActions(customer.status).map((action) => (
            <button
              key={action.status}
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => {
                setStatus(action.status);
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** Campos del alta; un problema de otro campo se muestra en el aviso general. */
const CREATE_FIELDS = ['username', 'password', 'name', 'phone'];

/** Mensaje de un campo del alta, si el nodo lo rechazó. */
function issueFor(issues: FieldIssue[], path: string): string | null {
  return issues.find((issue) => issue.path === path)?.message ?? null;
}

function NewCustomerDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (customer: Customer) => void;
}) {
  const { api } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<FieldIssue[]>([]);

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setIssues([]);
    api
      .post(
        '/customers',
        { username: username.trim(), password, name, phone: phone.trim() || null },
        customerSchema,
      )
      .then(onCreated, (failure: unknown) => {
        setBusy(false);
        setError(errorMessage(failure));
        if (failure instanceof ApiError) setIssues(failure.issues);
      });
  };

  const field = (id: string, label: string, path: string, input: ReactNode, hint?: string) => {
    const issue = issueFor(issues, path);
    return (
      <div className="field">
        <label className="label" htmlFor={id}>
          {label}
        </label>
        {input}
        {issue ? (
          <span className="field-error">{issue}</span>
        ) : (
          hint && <span className="field-hint">{hint}</span>
        )}
      </div>
    );
  };

  return (
    <Dialog title="Nuevo cliente" onClose={onClose} onSubmit={submit}>
      {field(
        'nuevo-usuario',
        'Usuario',
        'username',
        <input
          id="nuevo-usuario"
          className="input"
          autoFocus
          required
          autoComplete="off"
          minLength={3}
          maxLength={32}
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
          }}
        />,
        'De 3 a 32 letras, números, puntos o guiones, sin espacios ni tildes.',
      )}
      {field(
        'nueva-clave',
        'Contraseña',
        'password',
        <input
          id="nueva-clave"
          className="input"
          type={showPassword ? 'text' : 'password'}
          required
          autoComplete="new-password"
          minLength={4}
          maxLength={256}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />,
        'Al menos 4 caracteres. La elige el cliente.',
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: -8 }}>
        <input
          type="checkbox"
          checked={showPassword}
          onChange={(event) => {
            setShowPassword(event.target.checked);
          }}
        />
        <span className="muted">Mostrar la contraseña</span>
      </label>
      {field(
        'nuevo-nombre',
        'Nombre (opcional)',
        'name',
        <input
          id="nuevo-nombre"
          className="input"
          autoComplete="off"
          maxLength={100}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />,
      )}
      {field(
        'nuevo-telefono',
        'Teléfono (opcional)',
        'phone',
        <input
          id="nuevo-telefono"
          className="input"
          type="tel"
          autoComplete="off"
          placeholder="0412-1234567"
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value);
          }}
        />,
        'Solo teléfonos venezolanos.',
      )}
      {error && !issues.some((issue) => CREATE_FIELDS.includes(issue.path)) && (
        <div role="alert" className="alert-error">
          {error}
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Creando…' : 'Crear cliente'}
        </button>
      </div>
    </Dialog>
  );
}
