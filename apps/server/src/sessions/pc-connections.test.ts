import { type NativeNodeToPcMessage, seconds } from '@pope/shared';
import { describe, expect, it } from 'vitest';

import type { PcConnection } from './pc-connections.js';
import { PcConnections } from './pc-connections.js';

const PC = { id: '01900000-0000-7000-8000-000000000004', name: 'PC 04' };
const SESSION = '01900000-0000-7000-8000-000000000100';

function connected() {
  const sent: NativeNodeToPcMessage[] = [];
  const connection = {
    authentication: { credentialId: 'c', pc: PC },
    pc: null,
    send: (message: NativeNodeToPcMessage) => {
      sent.push(message);
    },
    close: () => undefined,
  } as unknown as PcConnection;
  const connections = new PcConnections();
  connections.register(PC, connection);
  return { connections, sent };
}

const active = {
  type: 'state',
  status: 'active',
  vesRate: null,
  session: {
    kind: 'temporary',
    sessionId: SESSION,
    startedAt: '2026-10-22T20:00:00.000Z',
    name: 'Carlos',
    purchasedSeconds: seconds(3600),
    remainingSeconds: seconds(3000),
  },
} as const;

describe('PCs con la sesión retenida (REQ-003-11, T34d)', () => {
  it('una PC retenida nunca recibe un estado activo: se le manda held', () => {
    const { connections, sent } = connected();
    connections.hold(PC.id, SESSION);
    expect(connections.send(PC.id, active)).toBe(true);
    expect(sent).toEqual([
      { type: 'state', status: 'held', sessionId: SESSION, reason: 'credential_revoked' },
    ]);
  });

  it('tampoco recibe avisos de fin de tiempo, pero sí el resto de mensajes', () => {
    const { connections, sent } = connected();
    connections.hold(PC.id, SESSION);
    expect(connections.send(PC.id, { type: 'warning', sessionId: SESSION, minutesLeft: 5 })).toBe(
      false,
    );
    expect(connections.send(PC.id, { type: 'state', status: 'locked' })).toBe(true);
    expect(sent).toEqual([{ type: 'state', status: 'locked' }]);
  });

  it('al soltar la retención vuelve a recibir su estado con normalidad', () => {
    const { connections, sent } = connected();
    connections.hold(PC.id, SESSION);
    connections.release(PC.id);
    connections.send(PC.id, active);
    expect(sent).toEqual([active]);
  });
});
