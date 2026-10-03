// El Shell muestra lo que dice el nodo (ADR-0007): pantalla de bloqueo o sesión abierta, y
// entre medias "Tu sesión terminó".
import type { PcChannel } from './channel/channel.js';
import { usePcChannel } from './channel/use-pc-channel.js';
import { LockScreen } from './lock/LockScreen.js';
import { EndedScreen } from './session/EndedScreen.js';
import { PauseScreen } from './session/PauseScreen.js';
import { SessionScreen } from './session/SessionScreen.js';

export function App({ channel, pcName }: { channel: PcChannel; pcName: string }) {
  const { feed, login, listCombos, buyCombo, logout, pause, resume, closeWarning, closeEnded } =
    usePcChannel(channel);
  // En pausa manda la pantalla de pausa, también al recargar (reinicio de la PC, REQ-002-31).
  if (
    feed.state?.status === 'active' &&
    feed.state.session.kind === 'account' &&
    feed.state.session.pause
  ) {
    return (
      <PauseScreen
        session={feed.state.session}
        vesRate={feed.state.vesRate}
        stateAt={feed.stateAt}
        status={feed.status}
        pcName={pcName}
        warning={feed.warning?.minutesLeft ?? null}
        onCloseWarning={closeWarning}
        resume={resume}
      />
    );
  }
  if (feed.state?.status === 'active') {
    return (
      <SessionScreen
        session={feed.state.session}
        vesRate={feed.state.vesRate}
        stateAt={feed.stateAt}
        status={feed.status}
        pcName={pcName}
        warning={feed.warning?.minutesLeft ?? null}
        onCloseWarning={closeWarning}
        listCombos={listCombos}
        buyCombo={buyCombo}
        logout={logout}
        pause={pause}
      />
    );
  }
  if (feed.ended) {
    return <EndedScreen pcName={pcName} onDone={closeEnded} />;
  }
  return <LockScreen feed={feed} pcName={pcName} login={login} />;
}
