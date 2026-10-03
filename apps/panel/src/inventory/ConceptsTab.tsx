// Pestaña "Otras ventas" de Inventario (REQ-005-05): los conceptos que se venden sin
// inventario, como "Impresiones", con su precio por unidad sugerido. Solo el administrador
// los da de alta y los edita; el resto del personal los ve.
import {
  formatBolivares,
  formatMoney,
  type SaleConcept,
  saleConceptSchema,
  type VesRate,
} from '@pope/shared';
import { useEffect, useState } from 'react';

import { ApiError, listOf } from '../api/client.js';
import { useSession } from '../session.js';
import { ConceptDialog } from './ConceptDialog.js';
import { filterByName } from './model.js';

const conceptsSchema = listOf(saleConceptSchema);

export function ConceptsTab({
  query,
  isAdmin,
  vesRate,
  editing,
  onEdit,
}: {
  query: string;
  isAdmin: boolean;
  vesRate: VesRate | undefined;
  /** El concepto que se edita, `'new'` para el alta o `null`. */
  editing: SaleConcept | 'new' | null;
  onEdit: (concept: SaleConcept | 'new' | null) => void;
}) {
  const { api } = useSession();
  const [concepts, setConcepts] = useState<SaleConcept[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/sale-concepts', conceptsSchema).then(
      (list) => {
        if (!cancelled) setConcepts(list);
      },
      (failure: unknown) => {
        if (!cancelled) setError(failure instanceof ApiError ? failure.message : String(failure));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  const shown = filterByName(concepts ?? [], query);
  const saved = (concept: SaleConcept) => {
    setConcepts((prev) => {
      const list = prev ?? [];
      return list.some((c) => c.id === concept.id)
        ? list.map((c) => (c.id === concept.id ? concept : c))
        : [...list, concept];
    });
    onEdit(null);
  };

  return (
    <div className="inventory-list">
      {error && (
        <div role="alert" className="alert-error">
          {error}
        </div>
      )}
      {concepts?.length === 0 && (
        <p className="detail-note" style={{ margin: 0 }}>
          Aún no hay conceptos.{isAdmin ? ' Crea el primero con «Nuevo concepto».' : ''}
        </p>
      )}
      {shown.length > 0 && (
        <table className="inventory-table">
          <thead>
            <tr>
              <th>Concepto</th>
              <th className="num-cell">Precio por unidad sugerido</th>
              <th>Estado</th>
              {isAdmin && (
                <th>
                  <span className="sr-only">Acciones</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {shown.map((concept) => (
              <tr key={concept.id}>
                <td style={{ height: 48, fontWeight: 700 }}>{concept.name}</td>
                <td className="num-cell num">
                  <div>{formatMoney(concept.unitPriceMicros)}</div>
                  {vesRate !== undefined && (
                    <div className="muted" style={{ fontSize: 11 }}>
                      {formatBolivares(concept.unitPriceMicros, vesRate)}
                    </div>
                  )}
                </td>
                <td>
                  <span className={`stock-pill ${concept.active ? 'stock-ok' : 'stock-inactive'}`}>
                    {concept.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                {isAdmin && (
                  <td className="num-cell">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        onEdit(concept);
                      }}
                    >
                      Editar
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="detail-note" style={{ margin: 0 }}>
        Se venden desde la Caja, en «Otras ventas», con la cantidad y el precio que diga el
        encargado. No llevan stock.
      </p>
      {editing && (
        <ConceptDialog
          concept={editing === 'new' ? null : editing}
          vesRate={vesRate}
          onClose={() => {
            onEdit(null);
          }}
          onDone={saved}
        />
      )}
    </div>
  );
}
