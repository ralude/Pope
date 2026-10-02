// "Tu sesión terminó" (T48, REQ-001-25): el mismo mensaje para cualquier motivo, y a los
// 10 s vuelve sola la pantalla de bloqueo (decisión del mantenedor).
import { useEffect, useState } from 'react';

import { Wallpaper } from '../lock/Wallpaper.js';

/** Segundos que se muestra antes de volver al bloqueo. */
export const ENDED_SECONDS = 10;

export function EndedScreen({ pcName, onDone }: { pcName: string; onDone: () => void }) {
  const [left, setLeft] = useState(ENDED_SECONDS);

  useEffect(() => {
    const timer = setInterval(() => {
      setLeft((n) => n - 1);
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (left <= 0) onDone();
  }, [left, onDone]);

  return (
    <div className="screen">
      <Wallpaper blurred />
      <main className="screen-center">
        <section className="glass ended-card" aria-labelledby="t-ended">
          <div className="ended-icon">
            <svg
              width="40"
              height="40"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="10" cy="10" r="7" />
              <path d="M10 6v4.5l3 2" />
            </svg>
          </div>
          <h1 id="t-ended">Tu sesión terminó</h1>
          <p className="ended-text">
            Gracias por venir. Para seguir jugando en la {pcName}, acércate al mostrador.
          </p>
          <div className="ended-progress">
            <div role="status">Volviendo a la pantalla de inicio en {Math.max(0, left)} s</div>
            <div className="bar">
              <div
                className="bar-fill"
                style={{ width: `${String(((ENDED_SECONDS - left) / ENDED_SECONDS) * 100)}%` }}
              />
            </div>
          </div>
          <button type="button" className="btn-ghost" onClick={onDone} autoFocus>
            Volver ahora
          </button>
        </section>
      </main>
    </div>
  );
}
