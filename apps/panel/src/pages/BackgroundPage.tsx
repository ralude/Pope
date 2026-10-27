// Fondo de la pantalla de bloqueo (spec 003, REQ-003-70, REQ-003-76), solo para el
// administrador: elige una imagen, el panel la reduce y la comprime en el navegador, muestra la
// vista previa y, al confirmar, la sube como el fondo de todas las PCs.
import {
  LOCAL_TIME_ZONE,
  type LockBackgroundSnapshot,
  lockBackgroundSnapshotSchema,
} from '@pope/shared';
import { useEffect, useRef, useState } from 'react';

import { ApiError } from '../api/client.js';
import '../background/background.css';
import {
  BACKGROUND_ACCEPT,
  type PreparedBackground,
  prepareBackground,
} from '../background/prepare.js';
import { BackgroundError } from '../background/source.js';
import { useSession } from '../session.js';
import { Frame } from '../ui/Frame.js';

function errorMessage(failure: unknown): string {
  return failure instanceof ApiError || failure instanceof BackgroundError
    ? failure.message
    : String(failure);
}

// Fecha del cambio en la zona del local (AGENTS.md: se guarda en UTC y se muestra en la zona
// de quien mira; esta pantalla es del administrador del local).
const dateFormat = new Intl.DateTimeFormat('es-VE', {
  timeZone: LOCAL_TIME_ZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** Tamaño en KB (decimales, como los límites de la spec) para mostrar. */
function kilobytes(bytes: number): string {
  return `${String(Math.max(1, Math.round(bytes / 1000)))} KB`;
}

function currentText(snapshot: LockBackgroundSnapshot): string {
  // Sin imagen: nunca se cambió (revisión 0) o se quitó; en los dos casos manda el de Pope.
  if (snapshot.background === null) {
    return 'Se usa el fondo por defecto de Pope.';
  }
  const { width, height, size } = snapshot.background;
  // Sin punto final: la hora en es-VE ya termina en «p. m.».
  return `Fondo personalizado de ${String(width)}×${String(height)} (${kilobytes(size)}). Cambiado por ${snapshot.changedBy.name} el ${dateFormat.format(new Date(snapshot.changedAt))}`;
}

export function BackgroundPage() {
  const { api } = useSession();
  const [snapshot, setSnapshot] = useState<LockBackgroundSnapshot | null>(null);
  const [prepared, setPrepared] = useState<PreparedBackground | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/lock-background', lockBackgroundSnapshotSchema).then(
      (loaded) => {
        if (!cancelled) setSnapshot(loaded);
      },
      (failure: unknown) => {
        if (!cancelled) setError(errorMessage(failure));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  // La vista previa es una URL del navegador: se libera al cambiar de imagen o al salir.
  useEffect(() => {
    if (!prepared) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(prepared.blob);
    setPreview(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [prepared]);

  const choose = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setDone(null);
    setPrepared(null);
    setPreparing(true);
    prepareBackground(file)
      .then(setPrepared, (failure: unknown) => {
        setError(errorMessage(failure));
      })
      .finally(() => {
        setPreparing(false);
      });
  };

  const save = () => {
    if (!prepared) return;
    setSaving(true);
    setError(null);
    api
      .upload('/lock-background', prepared.blob, lockBackgroundSnapshotSchema)
      .then(
        (saved) => {
          setSnapshot(saved);
          setDone(
            'Fondo guardado. Las PCs conectadas lo descargan y lo muestran cuando está completo.',
          );
        },
        (failure: unknown) => {
          setError(errorMessage(failure));
        },
      )
      .finally(() => {
        setSaving(false);
      });
  };

  return (
    <Frame title="Fondo de bloqueo">
      <div className="background-page">
        <div className="background-block">
          <h2 className="label">Fondo actual</h2>
          {snapshot === null && !error && <span className="muted">Leyendo el fondo…</span>}
          {snapshot && <span>{currentText(snapshot)}</span>}
        </div>

        <div className="background-block">
          <h2 className="label">Nueva imagen</h2>
          <div className="background-actions">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={preparing || saving}
              onClick={() => {
                fileInput.current?.click();
              }}
            >
              {preparing ? 'Preparando la imagen…' : 'Elegir imagen'}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept={BACKGROUND_ACCEPT}
              className="sr-only"
              aria-label="Imagen del fondo de bloqueo"
              onChange={(event) => {
                choose(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </div>
          <span className="field-hint">
            JPG, PNG o WebP de hasta 10 MB y 40 millones de píxeles. Se reduce a 1920×1080 como
            mucho, sin deformarla, antes de subirla.
          </span>
        </div>

        {error && (
          <div role="alert" className="alert-error">
            {error}
          </div>
        )}

        {prepared && preview && (
          <div className="background-block">
            <h2 className="label">Vista previa</h2>
            <div className="background-preview">
              <img src={preview} alt="Vista previa del fondo de bloqueo" />
            </div>
            <span className="field-hint">
              {String(prepared.width)}×{String(prepared.height)} · {kilobytes(prepared.blob.size)}.
              Se verá en la pantalla de bloqueo de todas las PCs.
            </span>
            {done && (
              <span role="status" className="field-hint">
                {done}
              </span>
            )}
            <div className="background-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving || done !== null}
                onClick={save}
              >
                {saving ? 'Guardando…' : 'Usar como fondo de bloqueo'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Frame>
  );
}
