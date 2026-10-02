// El Shell muestra lo que dice el nodo (ADR-0007): pantalla de bloqueo o sesión abierta.
import type { PcChannel } from './channel/channel.js';
import { usePcChannel } from './channel/use-pc-channel.js';
import { LockScreen } from './lock/LockScreen.js';
import { SessionScreen } from './session/SessionScreen.js';

export function App({ channel, pcName }: { channel: PcChannel; pcName: string }) {
  const { feed, login } = usePcChannel(channel);
  if (feed.state?.status === 'active') {
    return <SessionScreen session={feed.state.session} pcName={pcName} />;
  }
  return <LockScreen feed={feed} pcName={pcName} login={login} />;
}
