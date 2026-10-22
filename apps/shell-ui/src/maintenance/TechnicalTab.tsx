// Pestaña «Técnico» (spec 003, T38b; REQ-003-42): pequeña y plegada arriba en el centro, para no
// tapar barras de título ni menús; al pasar el ratón (o con el teclado) se despliega con la PC,
// quién entró y «Terminar y bloquear». No muestra el tiempo transcurrido.
import type { PcMaintenance } from '@pope/shared';
import { useState } from 'react';

import type { TechnicalResult } from '../lock/technical.js';
import { tabText } from './maintenance.js';

export function TechnicalTab({
  maintenance,
  endMaintenance,
}: {
  maintenance: PcMaintenance;
  endMaintenance: (maintenanceId: string) => Promise<TechnicalResult>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = tabText(maintenance);
  if (!text) return null;

  async function end() {
    setBusy(true);
    setError(null);
    const result = await endMaintenance(maintenance.id);
    // Si terminó, el nodo da el mantenimiento por cerrado y esta pestaña desaparece.
    if (!result.ok) {
      setError(result.message);
      setBusy(false);
    }
  }

  return (
    <aside className="tech-tab" aria-label="Mantenimiento">
      <div className="tech-tab-handle" tabIndex={0}>
        Técnico
      </div>
      <div className="tech-tab-panel">
        <div className="tech-tab-summary">{text.summary}</div>
        {error && (
          <div role="alert" className="notice notice-error">
            {error}
          </div>
        )}
        <button
          type="button"
          className="btn-primary btn-small"
          disabled={busy}
          onClick={() => {
            void end();
          }}
        >
          {busy ? 'Terminando…' : 'Terminar y bloquear'}
        </button>
      </div>
    </aside>
  );
}
