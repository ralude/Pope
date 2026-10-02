// El Shell muestra lo que dice el nodo (ADR-0007): pantalla de bloqueo o sesión abierta, y
// entre medias "Tu sesión terminó".
import type { PcChannel } from './channel/channel.js';
import { usePcChannel } from './channel/use-pc-channel.js';
import { LockScreen } from './lock/LockScreen.js';
import { EndedScreen } from './session/EndedScreen.js';
import { SessionScreen } from './session/SessionScreen.js';

export function App({ channel, pcName }: { channel: PcChannel; pcName: string }) {
  const { feed, login, listCombos, buyCombo, logout, closeWarning, closeEnded } =
    usePcChannel(channel);
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
      />
    );
  }
  if (feed.ended) {
    return <EndedScreen pcName={pcName} onDone={closeEnded} />;
  }
  return <LockScreen feed={feed} pcName={pcName} login={login} />;
}
