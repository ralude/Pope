// Código de instalación de una PC (spec 003, T42a; REQ-003-10). Se pide al abrir el diálogo,
// se muestra con su cuenta atrás de 10 min y no se guarda en ningún sitio: al cerrar, desaparece.
import type { PcInstallationCodeResponse } from '@pope/shared';
import { useEffect, useState } from 'react';

import { ApiError } from '../api/client.js';
import { useSession } from '../session.js';
import { Dialog } from '../ui/Dialog.js';
import { codeClock, installationErrorMessage, requestInstallationCode } from './installation.js';

export function InstallationCodeDialog({
  pc,
  now,
  onClose,
}: {
  /** PC que se registra de nuevo, o `null` para una PC nueva. */
  pc: { id: string; name: string } | null;
  now: Date;
  onClose: () => void;
}) {
  const { api } = useSession();
  const [issued, setIssued] = useState<PcInstallationCodeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Cada «Generar otro» cambia esta cuenta y vuelve a pedir un código.
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIssued(null);
    setError(null);
    setCopied(false);
    requestInstallationCode(api, pc?.id).then(
      (response) => {
        if (!cancelled) setIssued(response);
      },
      (failure: unknown) => {
        if (cancelled) return;
        setError(
          failure instanceof ApiError
            ? installationErrorMessage(failure.code, failure.message)
            : String(failure),
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, pc?.id, attempt]);

  const clock = issued ? codeClock(issued.expiresAt, now) : null;

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Sin permiso del navegador: el código se puede leer y escribir a mano.
    }
  }

  return (
    <Dialog
      title={pc ? `Registrar de nuevo la ${pc.name}` : 'Añadir una PC'}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {error && (
        <div role="alert" className="alert-error">
          {error}
        </div>
      )}
      {!issued && !error && <p style={{ margin: 0 }}>Generando el código…</p>}
      {issued && clock && !clock.expired && (
        <>
          <p style={{ margin: 0 }}>Escríbelo en el asistente de instalación de la PC.</p>
          <div className="install-code num" aria-label="Código de instalación">
            {issued.code}
          </div>
          <p className="muted" role="timer" style={{ margin: 0 }}>
            Caduca en {clock.text} · sirve una sola vez
          </p>
          <div className="dialog-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                void copy(issued.code);
              }}
            >
              {copied ? 'Copiado' : 'Copiar'}
            </button>
            <button type="submit" className="btn btn-primary" autoFocus>
              Listo
            </button>
          </div>
        </>
      )}
      {issued && clock?.expired && (
        <>
          <p role="status" style={{ margin: 0 }}>
            El código caducó.
          </p>
          <div className="dialog-actions">
            <button type="submit" className="btn btn-ghost">
              Cerrar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setAttempt((n) => n + 1);
              }}
            >
              Generar otro
            </button>
          </div>
        </>
      )}
      {error && (
        <div className="dialog-actions">
          <button type="submit" className="btn btn-ghost">
            Cerrar
          </button>
        </div>
      )}
    </Dialog>
  );
}
