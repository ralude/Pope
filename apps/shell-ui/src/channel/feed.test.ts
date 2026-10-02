import { describe, expect, it } from 'vitest';

import type { NodeToPcMessage } from '@pope/shared';

import { applyEvent, dismissEnded, dismissWarning, INITIAL_FEED, type PcFeed } from './feed.js';

const SESSION = '01900000-0000-7000-8000-0000000000aa';
const OTHER = '01900000-0000-7000-8000-0000000000bb';

function active(remainingSeconds: number, sessionId = SESSION): NodeToPcMessage {
  return {
    type: 'state',
    status: 'active',
    vesRate: null,
    session: {
      kind: 'temporary',
      sessionId,
      startedAt: '2026-10-01T22:00:00.000Z',
      name: 'Carlos',
      purchasedSeconds: 1500,
      remainingSeconds,
    },
  } as NodeToPcMessage;
}

const ACTIVE = active(1500);

function receive(feed: PcFeed, message: NodeToPcMessage, now = 0): PcFeed {
  return applyEvent(feed, { kind: 'message', message }, now);
}

describe('avisos de fin de tiempo (T48, REQ-001-24)', () => {
  const warned = receive(receive(INITIAL_FEED, active(300)), {
    type: 'warning',
    sessionId: SESSION,
    minutesLeft: 5,
  });

  it('muestra el aviso que manda el nodo y lo mantiene con cada latido', () => {
    expect(warned.warning).toEqual({ sessionId: SESSION, minutesLeft: 5 });
    expect(receive(warned, active(290)).warning).toEqual({ sessionId: SESSION, minutesLeft: 5 });
  });

  it('el de 1 minuto sustituye al de 5', () => {
    expect(
      receive(warned, { type: 'warning', sessionId: SESSION, minutesLeft: 1 }).warning?.minutesLeft,
    ).toBe(1);
  });

  it('se quita con "Entendido", si el cliente compra tiempo o si cambia la sesión', () => {
    expect(dismissWarning(warned).warning).toBeNull();
    expect(receive(warned, active(20_000)).warning).toBeNull();
    expect(receive(warned, active(200, OTHER)).warning).toBeNull();
    expect(receive(warned, { type: 'state', status: 'locked' }).warning).toBeNull();
  });
});

describe('fin de sesión (T48, REQ-001-25)', () => {
  const inSession = receive(INITIAL_FEED, ACTIVE);

  it('muestra "Tu sesión terminó" por cualquier motivo del nodo', () => {
    for (const reason of ['exhausted', 'staff', 'no_heartbeat'] as const) {
      const feed = receive(inSession, { type: 'sessionEnded', sessionId: SESSION, reason });
      expect(feed.ended).toBe(true);
      expect(feed.warning).toBeNull();
    }
  });

  it('si la cerró el cliente, va directo al bloqueo', () => {
    expect(
      receive(inSession, { type: 'sessionEnded', sessionId: SESSION, reason: 'customer' }).ended,
    ).toBe(false);
  });

  it('se quita al pasar el tiempo o si se abre otra sesión', () => {
    const ended = receive(inSession, { type: 'sessionEnded', sessionId: SESSION, reason: 'staff' });
    expect(dismissEnded(ended).ended).toBe(false);
    expect(receive(ended, { type: 'state', status: 'locked' }).ended).toBe(true);
    expect(receive(ended, active(600, OTHER)).ended).toBe(false);
  });
});

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
