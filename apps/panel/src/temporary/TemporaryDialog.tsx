// Abrir una sesión temporal en una PC libre o añadirle tiempo (T44, REQ-001-60, REQ-001-61,
// REQ-001-70): por tiempo o por importe, con el otro valor calculado a la tarifa (la de hoy al
// abrir, la de la sesión al añadir), y el método de pago. El cobro va al turno de quien cobra.
import {
  defaultTemporaryName,
  formatDuration,
  formatMoney,
  type Micros,
  type PaymentMethod,
  rateFor,
  tariffTableSchema,
  temporarySessionSchema,
} from '@pope/shared';
import { type SyntheticEvent, useEffect, useState } from 'react';

import { ApiError } from '../api/client.js';
import { useSession } from '../session.js';
import { useShift } from '../shift.js';
import { PaymentMethodField, ShiftRequirement } from '../ui/charge.js';
import { Dialog } from '../ui/Dialog.js';
import { type ChargeMode, chargeOf, minutesLabel, QUICK_MINUTES } from './model.js';

/** Abrir en una PC libre, o añadir tiempo a la temporal de una PC. */
export type TemporaryTarget =
  | { action: 'open'; pc: { id: string; name: string } }
  | {
      action: 'add';
      sessionId: string;
      who: string;
      pcName: string;
      rateMicrosPerHour: Micros;
    };

function errorMessage(failure: unknown): string {
  return failure instanceof ApiError ? failure.message : String(failure);
}

export function TemporaryDialog({
  target,
  now,
  onClose,
}: {
  target: TemporaryTarget;
  /** Hora del nodo: decide la tarifa de hoy y el nombre por defecto. */
  now: Date;
  onClose: () => void;
}) {
  const { api } = useSession();
  const { shift } = useShift();
  const [todayRate, setTodayRate] = useState<Micros | null>(null);
  const [mode, setMode] = useState<ChargeMode>('minutes');
  const [text, setText] = useState('60');
  const [name, setName] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash_usd');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La hora del nodo al abrir el diálogo fija la tarifa de hoy y el nombre por defecto.
  const [openedAt] = useState(now);
  const placeholder =
    target.action === 'open' ? defaultTemporaryName(target.pc.name, openedAt) : '';

  const opening = target.action === 'open';
  useEffect(() => {
    if (!opening) return;
    let cancelled = false;
    api.get('/tariffs', tariffTableSchema).then(
      (table) => {
        if (!cancelled) setTodayRate(rateFor(table, openedAt));
      },
      (failure: unknown) => {
        if (!cancelled) setError(errorMessage(failure));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, opening, openedAt]);

  const rate = target.action === 'add' ? target.rateMicrosPerHour : todayRate;
  const charge = rate === null ? null : chargeOf(mode, text, rate);

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!charge || !shift) return;
    setBusy(true);
    setError(null);
    const request =
      target.action === 'open'
        ? api.post(
            '/sessions/temporary',
            {
              pcId: target.pc.id,
              paymentMethod: method,
              ...(name.trim() ? { name: name.trim() } : {}),
              ...charge.body,
            },
            temporarySessionSchema,
          )
        : api.post(
            `/sessions/${target.sessionId}/time`,
            { paymentMethod: method, ...charge.body },
            temporarySessionSchema,
          );
    request.then(onClose, (failure: unknown) => {
      setBusy(false);
      setError(errorMessage(failure));
    });
  };

  const title = opening
    ? `Sesión temporal en ${target.pc.name}`
    : // El nombre por defecto ya lleva la PC («Temporal · PC 05 · 18:30»).
      `Añadir tiempo a ${target.who.includes(target.pcName) ? target.who : `${target.who} · ${target.pcName}`}`;
  const rateText = rate === null ? '…' : formatMoney(rate, { suffix: '/h' });

  return (
    <Dialog title={title} onClose={onClose} onSubmit={submit}>
      {shift && (
        <>
          <div className="segmented" role="group" aria-label="Cobrar por">
            <button
              type="button"
              aria-pressed={mode === 'minutes'}
              onClick={() => {
                setMode('minutes');
                setText('60');
              }}
            >
              Por tiempo
            </button>
            <button
              type="button"
              aria-pressed={mode === 'amount'}
              onClick={() => {
                setMode('amount');
                setText('');
              }}
            >
              Por importe
            </button>
          </div>
          <div className="field">
            <label className="label" htmlFor="temporal-cantidad">
              {mode === 'minutes' ? 'Minutos' : 'Importe (USD)'}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <input
                id="temporal-cantidad"
                className="input amount-input"
                inputMode={mode === 'minutes' ? 'numeric' : 'decimal'}
                autoComplete="off"
                autoFocus
                placeholder={mode === 'minutes' ? '60' : '1,50'}
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                }}
              />
              <span style={{ color: 'var(--soft)' }}>
                {charge ? (
                  mode === 'minutes' ? (
                    <>
                      Se cobra{' '}
                      <strong className="num">{formatMoney(charge.purchase.charge)}</strong> a{' '}
                      {rateText}
                    </>
                  ) : (
                    <>
                      Da <strong className="num">{formatDuration(charge.purchase.seconds)}</strong>{' '}
                      a {rateText}
                    </>
                  )
                ) : mode === 'minutes' ? (
                  'Escribe de 1 a 1440 minutos.'
                ) : (
                  'Escribe un importe que dé como mucho 24 h.'
                )}
              </span>
            </div>
            {mode === 'minutes' && (
              <div className="chips">
                {QUICK_MINUTES.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    className="chip"
                    aria-pressed={text === String(minutes)}
                    onClick={() => {
                      setText(String(minutes));
                    }}
                  >
                    {minutesLabel(minutes)}
                  </button>
                ))}
              </div>
            )}
          </div>
          {opening && (
            <div className="field">
              <label className="label" htmlFor="temporal-nombre">
                Nombre (opcional)
              </label>
              <input
                id="temporal-nombre"
                className="input"
                autoComplete="off"
                maxLength={60}
                placeholder={placeholder}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </div>
          )}
          <PaymentMethodField
            name={opening ? 'pago-temporal' : 'pago-anadir'}
            value={method}
            onChange={setMethod}
          />
        </>
      )}
      <ShiftRequirement what="Los cobros" />
      {error && (
        <div role="alert" className="alert-error">
          {error}
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        {shift && (
          <button type="submit" className="btn btn-primary" disabled={busy || !charge}>
            {busy ? 'Cobrando…' : opening ? 'Abrir y desbloquear la PC' : 'Cobrar y añadir'}
          </button>
        )}
      </div>
    </Dialog>
  );
}
