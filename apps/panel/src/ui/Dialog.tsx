// Diálogo modal del panel: un formulario centrado sobre una capa oscura, sin `confirm()` del
// navegador. Escape lo cierra. El foco inicial lo pone el contenido con `autoFocus`.
import { type ReactNode, type SyntheticEvent, useEffect, useId } from 'react';

export function Dialog({
  title,
  onClose,
  onSubmit,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  onSubmit: (event: SyntheticEvent) => void;
  children: ReactNode;
}) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="dialog-backdrop">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card dialog"
        onSubmit={onSubmit}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
      </form>
    </div>
  );
}
