// El Shell muestra lo que dice el nodo (ADR-0007): pantalla de bloqueo o sesión abierta, y
// entre medias "Tu sesión terminó". Con un mantenimiento abierto, además, la pestaña «Técnico».
import type { ReactNode } from 'react';

import type { PcChannel } from './channel/channel.js';
import type { PcFeed } from './channel/feed.js';
import { usePcChannel } from './channel/use-pc-channel.js';
import { LockScreen } from './lock/LockScreen.js';
import { TechnicalTab } from './maintenance/TechnicalTab.js';
import { EndedScreen } from './session/EndedScreen.js';
import { HeldScreen } from './session/HeldScreen.js';
import { isHeld } from './session/held.js';
import { PauseScreen } from './session/PauseScreen.js';
import { SessionScreen } from './session/SessionScreen.js';

type Channel = ReturnType<typeof usePcChannel>;

export function App({ channel, pcName }: { channel: PcChannel; pcName: string }) {
  const hook = usePcChannel(channel);
  const { feed, endMaintenance } = hook;
  return (
    <>
      <Screen hook={hook} pcName={feed.pcName ?? pcName} />
      {feed.maintenance && (
        <TechnicalTab maintenance={feed.maintenance} endMaintenance={endMaintenance} />
      )}
    </>
  );
}

function Screen({ hook, pcName }: { hook: Channel; pcName: string }): ReactNode {
  const { feed, login, technicalLogin, listCombos, buyCombo, logout, pause, resume } = hook;
  return screenFor(feed, pcName, {
    login,
    technicalLogin,
    listCombos,
    buyCombo,
    logout,
    pause,
    resume,
    closeWarning: hook.closeWarning,
    closeEnded: hook.closeEnded,
  });
}

function screenFor(
  feed: PcFeed,
  displayPcName: string,
  actions: Pick<
    Channel,
    | 'login'
    | 'technicalLogin'
    | 'listCombos'
    | 'buyCombo'
    | 'logout'
    | 'pause'
    | 'resume'
    | 'closeWarning'
    | 'closeEnded'
  >,
): ReactNode {
  // Sesión retenida por una revocación (REQ-003-11): sin botones, antes que cualquier otra.
  if (isHeld(feed)) return <HeldScreen pcName={displayPcName} />;
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
        pcName={displayPcName}
        warning={feed.warning?.minutesLeft ?? null}
        onCloseWarning={actions.closeWarning}
        resume={actions.resume}
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
        pcName={displayPcName}
        warning={feed.warning?.minutesLeft ?? null}
        onCloseWarning={actions.closeWarning}
        listCombos={actions.listCombos}
        buyCombo={actions.buyCombo}
        logout={actions.logout}
        pause={actions.pause}
      />
    );
  }
  if (feed.ended) {
    return <EndedScreen pcName={displayPcName} onDone={actions.closeEnded} />;
  }
  return (
    <LockScreen
      feed={feed}
      pcName={displayPcName}
      login={actions.login}
      technicalLogin={actions.technicalLogin}
    />
  );
}
