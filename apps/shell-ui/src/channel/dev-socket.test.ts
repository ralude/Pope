import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { devPcId, NATIVE_PC_PROTOCOL_VERSION } from '@pope/shared';

import type { ChannelEvent } from './channel.js';
import { type DevSocket, DevSocketChannel, parseNodeMessage } from './dev-socket.js';

const PC = devPcId(5);
const SESSION = '01900000-0000-7000-8000-0000000000aa';

class FakeSocket implements DevSocket {
  sent: unknown[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(): void {
    this.closed = true;
  }
  receive(message: object): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

function activeState(remainingSeconds: number) {
  return {
    type: 'state',
    status: 'active',
    vesRate: null,
    session: {
      kind: 'temporary',
      sessionId: SESSION,
      startedAt: '2026-10-01T22:00:00.000Z',
      name: 'Carlos',
      purchasedSeconds: 1500,
      remainingSeconds,
    },
  };
}

describe('DevSocketChannel (T46)', () => {
  let sockets: FakeSocket[];
  let events: ChannelEvent[];
  let channel: DevSocketChannel;

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
    });
    sockets = [];
    events = [];
    channel = new DevSocketChannel({
      url: 'ws://nodo/pc',
      pcId: PC,
      connect: () => {
        const created = new FakeSocket();
        sockets.push(created);
        return created;
      },
    });
    channel.start((event) => events.push(event));
  });

  afterEach(() => {
    channel.stop();
    vi.useRealTimers();
  });

  const statuses = () => events.flatMap((e) => (e.kind === 'status' ? [e.status] : []));

  /** La conexión número `n` que abrió el canal. */
  function socket(n: number): FakeSocket {
    const found = sockets[n];
    if (!found) throw new Error(`No hay conexión ${String(n)}`);
    return found;
  }

  it('se identifica con hello y queda en línea al recibir el estado', () => {
    socket(0).onopen?.();
    expect(socket(0).sent[0]).toEqual({
      type: 'hello',
      protocolVersion: NATIVE_PC_PROTOCOL_VERSION,
      pcId: PC,
      sessionId: null,
      recoveryState: 'unknown',
      controlContext: null,
      pendingMaintenanceExitId: null,
    });
    expect(statuses()).toEqual(['connecting']);
    socket(0).receive({ type: 'state', status: 'locked' });
    expect(statuses()).toEqual(['connecting', 'online']);
    expect(events.at(-1)).toEqual({
      kind: 'message',
      message: { type: 'state', status: 'locked' },
    });
  });

  it('late cada 10 s con la sesión y el restante que lleva la PC', () => {
    socket(0).onopen?.();
    socket(0).receive(activeState(600));
    vi.advanceTimersByTime(10_000);
    expect(socket(0).sent.at(-1)).toEqual({
      type: 'heartbeat',
      sessionId: SESSION,
      localRemainingSeconds: 590,
      controlContext: null,
    });
  });

  it('envía las peticiones del Shell solo con conexión', () => {
    const request = { type: 'login', requestId: 'r1', username: 'juan', password: '1234' } as const;
    expect(channel.send(request)).toBe(false);
    socket(0).onopen?.();
    expect(channel.send(request)).toBe(true);
    expect(socket(0).sent.at(-1)).toEqual(request);
  });

  it('si se corta, reconecta con recuperación desconocida sin cerrar una sesión del nodo', () => {
    socket(0).onopen?.();
    socket(0).receive(activeState(600));
    socket(0).onclose?.();
    expect(statuses().at(-1)).toBe('offline');
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);
    socket(1).onopen?.();
    expect(socket(1).sent[0]).toMatchObject({
      type: 'hello',
      recoveryState: 'unknown',
      sessionId: null,
      controlContext: null,
    });
  });

  it('olvida la sesión cuando termina', () => {
    socket(0).onopen?.();
    socket(0).receive(activeState(600));
    socket(0).receive({ type: 'sessionEnded', sessionId: SESSION, reason: 'customer' });
    vi.advanceTimersByTime(10_000);
    expect(socket(0).sent.at(-1)).toEqual({
      type: 'heartbeat',
      sessionId: null,
      localRemainingSeconds: null,
      controlContext: null,
    });
  });

  it('al parar no vuelve a conectar', () => {
    socket(0).onopen?.();
    channel.stop();
    expect(socket(0).closed).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });

  it('REQ-003-63: revocación detiene latidos/reintentos y bloquea la pantalla', () => {
    socket(0).onopen?.();
    socket(0).receive({
      type: 'pcAuthenticationError',
      code: 'pc_credential_revoked',
      message: 'Credencial revocada',
    });
    socket(0).onclose?.();
    vi.advanceTimersByTime(120_000);
    expect(sockets).toHaveLength(1);
    expect(socket(0).sent).toHaveLength(1);
    expect(channel.send({ type: 'logout' })).toBe(false);
    expect(events).toContainEqual({
      kind: 'message',
      message: { type: 'state', status: 'locked' },
    });
  });

  it('REQ-002-30: pausa sin billing conserva restante aunque venza su contador local', () => {
    socket(0).onopen?.();
    socket(0).receive({
      type: 'state',
      status: 'active',
      vesRate: null,
      session: {
        kind: 'account',
        sessionId: SESSION,
        startedAt: '2026-10-01T22:00:00.000Z',
        username: 'juan',
        ratePerHour: { micros: 1_000_000, currency: 'USD' },
        money: { micros: 0, currency: 'USD' },
        comboSeconds: 600,
        moneySeconds: 0,
        remainingSeconds: 600,
        pause: {
          startedAt: '2026-10-01T22:00:00.000Z',
          maxUntil: '2026-10-01T22:01:00.000Z',
          secondsLeft: 60,
          billing: false,
        },
      },
    });
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    vi.advanceTimersByTime(120_000);
    expect(socket(0).sent.at(-1)).toMatchObject({
      type: 'heartbeat',
      sessionId: SESSION,
      localRemainingSeconds: 600,
    });
  });
});

describe('parseNodeMessage', () => {
  it('descarta lo que no es un mensaje del protocolo', () => {
    expect(parseNodeMessage('no es json')).toBeNull();
    expect(parseNodeMessage(JSON.stringify({ type: 'otro' }))).toBeNull();
    expect(parseNodeMessage(42)).toBeNull();
    expect(parseNodeMessage(JSON.stringify({ type: 'state', status: 'locked' }))).toEqual({
      type: 'state',
      status: 'locked',
    });
  });
});
