// Alta y edición de un concepto que se vende sin inventario, como "Impresiones" (REQ-005-05),
// solo para el administrador. El precio es el sugerido: en la Caja el encargado puede cambiarlo.
import { formatBolivares, type SaleConcept, saleConceptSchema, type VesRate } from '@pope/shared';
import { type SyntheticEvent, useState } from 'react';

import { ApiError } from '../api/client.js';
import { useSession } from '../session.js';
import { Dialog } from '../ui/Dialog.js';
import { formatUsdInput, parseUsd } from '../ui/money.js';

export function ConceptDialog({
  concept,
  vesRate,
  onClose,
  onDone,
}: {
  /** `null` para dar de alta uno nuevo. */
  concept: SaleConcept | null;
  vesRate: VesRate | undefined;
  onClose: () => void;
  onDone: (concept: SaleConcept) => void;
}) {
  const { api } = useSession();
  const [name, setName] = useState(concept?.name ?? '');
  const [priceText, setPriceText] = useState(
    concept ? formatUsdInput(concept.unitPriceMicros) : '',
  );
  const [active, setActive] = useState(concept?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();
  const price = parseUsd(priceText);
  const valid = trimmed !== '' && price !== null;

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    const data = { name: trimmed, unitPriceMicros: price };
    const save = concept
      ? api.patch(`/sale-concepts/${concept.id}`, { ...data, active }, saleConceptSchema)
      : api.post('/sale-concepts', data, saleConceptSchema);
    save.then(onDone, (failure: unknown) => {
      setBusy(false);
      setError(failure instanceof ApiError ? failure.message : String(failure));
    });
  };

  return (
    <Dialog
      title={concept ? `Editar ${concept.name}` : 'Nuevo concepto'}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="field">
        <label className="label" htmlFor="concepto-nombre">
          Nombre
        </label>
        <input
          id="concepto-nombre"
          className="input"
          autoComplete="off"
          autoFocus
          maxLength={100}
          placeholder="Impresiones"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="concepto-precio">
          Precio por unidad sugerido (USD)
        </label>
        <input
          id="concepto-precio"
          className="input num"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,10"
          value={priceText}
          aria-invalid={priceText !== '' && price === null}
          onChange={(event) => {
            setPriceText(event.target.value);
          }}
        />
        {price !== null && vesRate !== undefined && (
          <span className="field-hint">{formatBolivares(price, vesRate)}</span>
        )}
        <span className="field-hint">En la Caja, el encargado puede cambiarlo al vender.</span>
      </div>
      {concept && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => {
              setActive(event.target.checked);
            }}
          />
          Activo: se puede vender
        </label>
      )}
      {error && (
        <div role="alert" className="alert-error">
          {error}
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || !valid}>
          {busy ? 'Guardando…' : 'Guardar concepto'}
        </button>
      </div>
    </Dialog>
  );
}
