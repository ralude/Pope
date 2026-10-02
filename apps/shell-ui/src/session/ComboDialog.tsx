// Comprar un combo con el saldo (T49, REQ-001-85), como en el diseño "Shell Pope · Fase 9":
// los combos a la venta, el elegido y cómo quedan el saldo y las horas antes de confirmar.
import { formatMoney, type Micros, micros, type PcCombo, type VesRate } from '@pope/shared';
import { useEffect, useState } from 'react';

import { type BuyResult, comboOptions, type CombosResult, defaultChoice } from './combos.js';
import { formatTimeLeft } from './format.js';

export function ComboDialog({
  moneyMicros,
  comboSeconds,
  vesRate,
  listCombos,
  buyCombo,
  onClose,
  onBought,
}: {
  /** Saldo y horas de combo en vivo, para ver qué alcanza y cómo quedan. */
  moneyMicros: Micros;
  comboSeconds: number;
  vesRate: VesRate | null;
  listCombos: () => Promise<CombosResult>;
  buyCombo: (comboId: string) => Promise<BuyResult>;
  onClose: () => void;
  /** Compra hecha; recibe el texto para el aviso de confirmación. */
  onBought: (notice: string) => void;
}) {
  const [combos, setCombos] = useState<PcCombo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listCombos().then((result) => {
      if (cancelled) return;
      if (result.ok) setCombos(result.combos);
      else setLoadError(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [listCombos]);

  const options = combos ? comboOptions(combos, moneyMicros, vesRate) : [];
  const selected =
    options.find((option) => option.comboId === chosen && option.affordable) ??
    options.find((option) => option.comboId === defaultChoice(options)) ??
    null;

  async function buy() {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    const result = await buyCombo(selected.comboId);
    if (result.ok) {
      onBought(`Listo: sumaste ${formatTimeLeft(selected.seconds)} de combo.`);
    } else {
      setError(result.message);
      setBusy(false);
    }
  }

  return (
    <div
      className="dialog-backdrop"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="t-combo" className="dialog">
        <div className="dialog-head">
          <h2 id="t-combo">Comprar combo</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Cerrar"
            onClick={onClose}
            disabled={busy}
            autoFocus
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M5 5l10 10M15 5 5 15" />
            </svg>
          </button>
        </div>
        <p className="dialog-text">
          Se paga con tu saldo. Las horas de combo no vencen, valen cualquier día y se gastan antes
          que el saldo.
        </p>

        {combos === null && loadError === null && <p className="muted">Cargando combos…</p>}
        {loadError !== null && (
          <div role="alert" className="notice notice-error">
            {loadError}
          </div>
        )}
        {combos !== null && options.length === 0 && (
          <p className="muted">No hay combos a la venta ahora.</p>
        )}

        {options.length > 0 && (
          <div className="combo-list">
            {options.map((option) => (
              <button
                key={option.comboId}
                type="button"
                className="combo-option"
                aria-pressed={option.comboId === selected?.comboId}
                disabled={!option.affordable || busy}
                onClick={() => {
                  setChosen(option.comboId);
                }}
              >
                <span className="combo-text">
                  <span className="combo-name">{option.name}</span>
                  <span className={option.affordable ? 'combo-detail' : 'combo-detail short'}>
                    {option.affordable ? option.detail : 'Saldo insuficiente'}
                  </span>
                </span>
                <span className="combo-price">
                  <span>{option.price}</span>
                  {option.priceBs !== null && <span className="combo-bs">{option.priceBs}</span>}
                </span>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="combo-summary">
            <div>
              <span className="muted">Saldo</span>
              <span>
                {formatMoney(moneyMicros)} →{' '}
                <strong>{formatMoney(micros(moneyMicros - selected.priceMicros))}</strong>
              </span>
            </div>
            <div>
              <span className="muted">Horas de combo</span>
              <span>
                {formatTimeLeft(comboSeconds)} →{' '}
                <strong>{formatTimeLeft(comboSeconds + selected.seconds)}</strong>
              </span>
            </div>
          </div>
        )}
        {options.length > 0 && !selected && (
          <div className="notice notice-warn">
            Tu saldo ({formatMoney(moneyMicros)}) no alcanza para ningún combo. Recarga en el
            mostrador.
          </div>
        )}
        {error !== null && (
          <div role="alert" className="notice notice-error">
            {error}
          </div>
        )}

        <div className="dialog-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          {selected && (
            <button
              type="button"
              className="btn-primary btn-wide"
              onClick={() => {
                void buy();
              }}
              disabled={busy}
            >
              {busy ? 'Comprando…' : `Comprar por ${selected.price}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
