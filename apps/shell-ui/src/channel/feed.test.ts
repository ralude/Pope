import { describe, expect, it } from 'vitest';

import type { NodeToPcMessage } from '@pope/shared';

import { applyEvent, INITIAL_FEED, type PcFeed } from './feed.js';

const SESSION = '01900000-0000-7000-8000-0000000000aa';

const ACTIVE = {
  type: 'state',
  status: 'active',
  vesRate: null,
  session: {
    kind: 'temporary',
    sessionId: SESSION,
    startedAt: '2026-10-01T22:00:00.000Z',
    name: 'Carlos',
    purchasedSeconds: 1500,
    remainingSeconds: 1500,
  },
} as NodeToPcMessage;

function receive(feed: PcFeed, message: NodeToPcMessage, now = 0): PcFeed {
  return applyEvent(feed, { kind: 'message', message }, now);
}

describe('applyEvent', () => {
  it('guarda el estado del nodo y cuándo llegó', () => {
    const feed = receive(INITIAL_FEED, ACTIVE, 1234);
    expect(feed.state).toEqual(ACTIVE);
    expect(feed.stateAt).toBe(1234);
  });

  it('sigue el estado de la conexión', () => {
    expect(applyEvent(INITIAL_FEED, { kind: 'status', status: 'online' }, 0).status).toBe('online');
  });

  it('al terminar la sesión vuelve al bloqueo', () => {
    const feed = receive(receive(INITIAL_FEED, ACTIVE), {
      type: 'sessionEnded',
      sessionId: SESSION,
      reason: 'exhausted',
    });
    expect(feed.state).toEqual({ type: 'state', status: 'locked' });
  });

  it('guarda los errores que no responden a una petición y los borra con el siguiente estado', () => {
    const problem = receive(INITIAL_FEED, {
      type: 'error',
      code: 'unknown_pc',
      message: 'Esta PC no está registrada en el nodo',
    });
    expect(problem.problem).toBe('Esta PC no está registrada en el nodo');
    expect(receive(problem, { type: 'state', status: 'locked' }).problem).toBeNull();
    expect(
      receive(INITIAL_FEED, {
        type: 'error',
        code: 'invalid_credentials',
        message: 'x',
        requestId: 'r1',
      }),
    ).toEqual(INITIAL_FEED);
  });
});
