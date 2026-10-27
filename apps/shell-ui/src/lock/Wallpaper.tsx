import { useState } from 'react';

// Fondo del Shell: el de Pope, hecho con CSS, o la imagen que el local subió desde el panel
// (REQ-003-70, REQ-003-73). La imagen la sirve el host nativo desde su carpeta; si no carga, se
// vuelve al fondo de Pope en vez de dejar una imagen rota.
export function Wallpaper({
  blurred = false,
  image = null,
}: {
  blurred?: boolean;
  /** URL de la imagen verificada (`backgroundUrl`), o `null` para el fondo de Pope. */
  image?: string | null;
}) {
  // La URL que falló, no un booleano: otra imagen (otra revisión) se vuelve a intentar.
  const [failed, setFailed] = useState<string | null>(null);
  const photo = image !== null && image !== failed ? image : null;
  return (
    <div className={blurred ? 'wallpaper wallpaper-blurred' : 'wallpaper'} aria-hidden="true">
      {photo === null ? (
        <div className="wp-shapes">
          <div className="wp-glow wp-glow-violet" />
          <div className="wp-glow wp-glow-teal" />
          <div className="wp-slash wp-slash-dark" />
          <div className="wp-slash wp-slash-violet" />
          <div className="wp-slash wp-slash-green" />
        </div>
      ) : (
        <img
          className="wp-photo"
          src={photo}
          alt=""
          onError={() => {
            setFailed(photo);
          }}
        />
      )}
      <div className="wp-shade" />
    </div>
  );
}
