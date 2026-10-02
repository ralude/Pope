// Aviso de que quedan 5 o 1 minutos (T48, REQ-001-24), arriba y en el centro, como en el
// diseño. Lo manda el nodo; se quita con "Entendido" o si el cliente compra más tiempo.
export function WarningToast({
  minutesLeft,
  temporary,
  onClose,
  onBuyCombo,
}: {
  minutesLeft: number;
  temporary: boolean;
  onClose: () => void;
  /** Abre la compra de combos (T49); `null` en las sesiones temporales, que no usan combos. */
  onBuyCombo: (() => void) | null;
}) {
  const title =
    minutesLeft === 1 ? 'Te queda 1 minuto' : `Te quedan ${String(minutesLeft)} minutos`;
  const text =
    minutesLeft === 1
      ? 'Guarda tu partida: al llegar a cero la PC se bloquea.'
      : temporary
        ? 'Si quieres más tiempo, habla con el mostrador.'
        : 'Compra un combo o recarga en el mostrador para seguir sin cortes.';

  return (
    <div role="alert" className="toast toast-warn">
      <div className="toast-icon">
        <svg
          width="22"
          height="22"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="7" />
          <path d="M10 6v4.5l3 2" />
        </svg>
      </div>
      <div className="toast-body">
        <div className="toast-title">{title}</div>
        <div className="toast-text">{text}</div>
        <div className="toast-actions">
          {onBuyCombo && (
            <button type="button" className="btn-primary btn-small" onClick={onBuyCombo}>
              Comprar combo
            </button>
          )}
          <button type="button" className="btn-ghost btn-small" onClick={onClose}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
