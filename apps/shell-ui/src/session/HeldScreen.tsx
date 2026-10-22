// «PC bloqueada por el encargado» (spec 003, T34h; REQ-003-11): sin botones, solo informa.
import { Wallpaper } from '../lock/Wallpaper.js';
import { HELD_TEXT, HELD_TITLE } from './held.js';

export function HeldScreen({ pcName }: { pcName: string }) {
  return (
    <div className="screen">
      <Wallpaper blurred />
      <main className="screen-center">
        <section className="glass ended-card" aria-labelledby="t-held">
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
              <rect x="4.5" y="9" width="11" height="8" rx="2" />
              <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
            </svg>
          </div>
          <h1 id="t-held">{HELD_TITLE}</h1>
          <p className="ended-text">{HELD_TEXT}</p>
          <p className="ended-text" role="status">
            {pcName}
          </p>
        </section>
      </main>
    </div>
  );
}
