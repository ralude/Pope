// Sesión abierta. De momento solo dice quién la usa: el tiempo, los saldos y las apps
// llegan con T47 y siguientes (diseño "Shell Pope · Fase 9").
import type { SessionState } from '@pope/shared';

import { Wallpaper } from '../lock/Wallpaper.js';

export function SessionScreen({ session, pcName }: { session: SessionState; pcName: string }) {
  const who = session.kind === 'account' ? session.username : session.name;
  return (
    <div className="screen">
      <Wallpaper blurred />
      <main className="screen-center">
        <section className="glass session-card" aria-labelledby="t-session">
          <h1 id="t-session" className="session-title">
            Hola, {who}
          </h1>
          <p className="muted">Tu sesión está abierta en la {pcName}.</p>
        </section>
      </main>
    </div>
  );
}
