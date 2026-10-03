// Caja en la barra superior, como en el diseño: «Caja cerrada · Abrir» abre el diálogo con el
// fondo (REQ-005-40) y «Turno abierto · 14:02» el de cerrar con el conteo (REQ-005-42). El
// dueño no cobra, así que no la ve.
import { formatLocalTime } from '@pope/shared';

import { useShift } from '../shift.js';

export function ShiftPill() {
  const { canCharge, shift, startOpen, startClose } = useShift();

  if (!canCharge || shift === undefined) return null;

  if (!shift) {
    return (
      <button type="button" className="shift-pill shift-closed" onClick={startOpen}>
        <span className="status-dot" style={{ background: 'var(--amber-bar)' }} />
        Caja cerrada · Abrir
      </button>
    );
  }

  return (
    <button type="button" className="shift-pill shift-open" onClick={startClose}>
      <span className="status-dot" style={{ background: 'var(--green-bar)' }} />
      Turno abierto · {formatLocalTime(new Date(shift.openedAt))}
    </button>
  );
}
