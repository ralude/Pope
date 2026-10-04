import { devPcId, nodeToPcMessageSchema, PROTOCOL_VERSION } from '@pope/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type PcEvent, type PcSocket, RECONNECT_DELAYS_MS, SimulatedPc } from './simulated-pc.js';

const SESSION_ID = '01900000-0000-7000-8000-000000000123';

/** Conexión falsa: guarda lo que se envía y deja que el test dispare open, message y close. */
class FakeSocket implements PcSocket {
  sent: Record<string, unknown>[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close(): void {
    this.closed = true;
  }
  open(): void {
    this.onopen?.();
  }
  receive(message: unknown): void {
    this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) });
  }
  /** El otro lado cierra la conexión. */
  drop(): void {
    this.onclose?.();
  }
  get types(): unknown[] {
    return this.sent.map((m) => m.type);
  }
}

const activeState = (remainingSeconds = 7200) => {
  const message = {
    type: 'state',
    status: 'active',
    vesRate: null,
    session: {
      kind: 'account',
      sessionId: SESSION_ID,
      startedAt: '2026-09-28T22:00:00.000Z',
      username: 'sim05',
      ratePerHour: { micros: 1_500_000, currency: 'USD' },
      comboSeconds: 0,
      money: { micros: 3_000_000, currency: 'USD' },
      moneySeconds: remainingSeconds,
      remainingSeconds,
    },
  };
  // Si el simulador acepta el mensaje, es porque cumple el protocolo real.
  expect(nodeToPcMessageSchema.safeParse(message).success).toBe(true);
  return message;
};
const LOCKED = { type: 'state', status: 'locked' };
const pausedState = (billing = false, remainingSeconds = 3600) => {
  const active = activeState(remainingSeconds);
  return {
    ...active,
    session: {
      ...active.session,
      pause: {
        startedAt: '2026-10-04T12:00:00.000Z',
        maxUntil: '2026-10-04T12:15:00.000Z',
        secondsLeft: billing ? 0 : 900,
        billing,
      },
    },
  };
};

describe('PC simulada (plan 001, comportamiento del agente)', () => {
  let sockets: FakeSocket[];
  let events: PcEvent[];
  let fakeNow: number;
  let pc: SimulatedPc;

  const last = () => {
    const socket = sockets.at(-1);
    if (!socket) {
      throw new Error('La PC no abrió ninguna conexión');
    }
    return socket;
  };
  /** Enciende la PC 5, abre su conexión y descarta el `hello`. */
  function boot(): FakeSocket {
    pc.start();
    last().open();
    return last();
  }
  const advance = (ms: number) => vi.advanceTimersByTime(ms);

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    events = [];
    fakeNow = 0;
    pc = new SimulatedPc({
      number: 5,
      url: 'ws://nodo/pc',
      connect: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      onEvent: (event) => events.push(event),
      now: () => fakeNow,
    });
  });

  afterEach(() => {
    pc.stop();
    vi.useRealTimers();
  });

  it('al conectar manda hello con su id y sin sesión', () => {
    const socket = boot();
    expect(socket.sent).toEqual([
      { type: 'hello', protocolVersion: PROTOCOL_VERSION, pcId: devPcId(5), sessionId: null },
    ]);
    expect(pc.name).toBe('PC 05');
    expect(events).toEqual([{ kind: 'connected' }]);
  });

  it('late cada 10 s aunque esté bloqueada, sin sesión ni restante', () => {
    const socket = boot();
    advance(9999);
    expect(socket.types).toEqual(['hello']);
    advance(1);
    advance(10_000);
    expect(socket.sent.slice(1)).toEqual([
      { type: 'heartbeat', sessionId: null, localRemainingSeconds: null },
      { type: 'heartbeat', sessionId: null, localRemainingSeconds: null },
    ]);
  });

  it('adopta la sesión del state, cuenta su restante en local y lo manda en cada latido', () => {
    const socket = boot();
    socket.receive(activeState(7200));
    expect(pc.snapshot()).toMatchObject({
      sessionId: SESSION_ID,
      who: 'sim05',
      localRemainingSeconds: 7200,
    });

    advance(10_000);
    advance(10_000);
    expect(socket.sent.slice(1)).toEqual([
      { type: 'heartbeat', sessionId: SESSION_ID, localRemainingSeconds: 7190 },
      { type: 'heartbeat', sessionId: SESSION_ID, localRemainingSeconds: 7180 },
    ]);
  });

  it('sessionEnded y un state bloqueado le hacen olvidar la sesión', () => {
    const socket = boot();
    socket.receive(activeState());
    socket.receive({ type: 'sessionEnded', sessionId: SESSION_ID, reason: 'exhausted' });
    expect(pc.snapshot()).toMatchObject({
      sessionId: null,
      who: null,
      localRemainingSeconds: null,
    });

    socket.receive(activeState());
    socket.receive(LOCKED);
    expect(pc.snapshot().sessionId).toBeNull();
  });

  it('un corte de red: sigue contando y reconecta con su sesión y su restante', () => {
    const socket = boot();
    socket.receive(activeState(7200));
    advance(5000);

    pc.networkCut(60);
    expect(socket.closed).toBe(true);
    expect(pc.snapshot().connected).toBe(false);
    advance(59_000);
    expect(sockets).toHaveLength(1);
    advance(1000);
    expect(sockets).toHaveLength(2);
    last().open();

    // 5 s + 60 s de cuenta local desde los 7200 s.
    expect(last().sent[0]).toEqual({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      pcId: devPcId(5),
      sessionId: SESSION_ID,
      localRemainingSeconds: 7135,
    });
  });

  it('reiniciar la PC pierde la sesión y vuelve a conectar con sessionId null', () => {
    const socket = boot();
    socket.receive(activeState());

    pc.reboot();
    expect(socket.closed).toBe(true);
    expect(sockets).toHaveLength(2);
    last().open();
    expect(last().sent[0]).toMatchObject({ type: 'hello', sessionId: null });
    expect(last().sent[0]).not.toHaveProperty('localRemainingSeconds');
  });

  it('un apagón deja de latir y de reconectar sin cerrar la conexión; al volver la luz arranca sin sesión', () => {
    const socket = boot();
    socket.receive(activeState());
    const sentBefore = socket.sent.length;

    pc.powerCut();
    advance(120_000);
    expect(socket.sent).toHaveLength(sentBefore);
    expect(socket.closed).toBe(false);
    expect(sockets).toHaveLength(1);
    expect(pc.snapshot()).toMatchObject({ poweredOff: true, connected: false, sessionId: null });

    pc.powerOn();
    expect(sockets).toHaveLength(2);
    last().open();
    expect(last().sent[0]).toMatchObject({ type: 'hello', sessionId: null });
    // La conexión vieja se cierra cuando la nueva ya está en marcha.
    expect(socket.closed).toBe(true);
  });

  it('si no puede conectar reintenta a los 1, 2, 4, 8, 16 y 30 s, sin pasar de 30', () => {
    expect(RECONNECT_DELAYS_MS).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000]);
    pc.start();
    for (const delay of [1000, 2000, 4000, 8000, 16_000, 30_000, 30_000]) {
      const count = sockets.length;
      last().drop();
      advance(delay - 1);
      expect(sockets).toHaveLength(count);
      advance(1);
      expect(sockets).toHaveLength(count + 1);
    }
    // Al conectar de verdad, la espera vuelve a empezar en 1 s.
    last().open();
    last().drop();
    const count = sockets.length;
    advance(1000);
    expect(sockets).toHaveLength(count + 1);
  });

  it('un mensaje que no cumple el protocolo se ignora y avisa, sin romper nada', () => {
    const socket = boot();
    socket.receive('esto no es json');
    socket.receive({ type: 'inventado' });
    socket.receive(activeState());

    expect(events.filter((e) => e.kind === 'invalid')).toHaveLength(2);
    expect(pc.snapshot().sessionId).toBe(SESSION_ID);
  });

  describe('login', () => {
    it('devuelve el state y los milisegundos que tardó', async () => {
      const socket = boot();
      const login = pc.login('sim05', 'sim1234');
      expect(socket.sent.at(-1)).toEqual({ type: 'login', username: 'sim05', password: 'sim1234' });

      fakeNow += 120;
      socket.receive(activeState());
      expect(await login).toMatchObject({ ok: true, ms: 120, message: { status: 'active' } });
    });

    it('devuelve el error del nodo con su latencia', async () => {
      const socket = boot();
      const login = pc.login('sim05', 'mala');
      fakeNow += 30;
      socket.receive({
        type: 'error',
        code: 'invalid_credentials',
        message: 'Usuario o contraseña incorrectos',
      });
      expect(await login).toMatchObject({
        ok: false,
        ms: 30,
        message: { code: 'invalid_credentials' },
      });
    });

    it('falla si la PC no está conectada, si ya hay uno en curso o si el nodo no contesta', async () => {
      await expect(pc.login('a', 'b')).rejects.toThrow('La PC no está conectada');
      boot();
      const first = pc.login('a', 'b');
      await expect(pc.login('a', 'b')).rejects.toThrow('Ya hay un login en curso');
      const timeout = expect(first).rejects.toThrow('El nodo no contestó al login');
      advance(30_000);
      await timeout;
    });

    it('falla si se pierde la conexión mientras espera', async () => {
      const socket = boot();
      const login = pc.login('a', 'b');
      const failed = expect(login).rejects.toThrow('Se perdió la conexión');
      socket.drop();
      await failed;
    });
  });

  it('logout manda el mensaje y la sesión se olvida con el sessionEnded del nodo', () => {
    const socket = boot();
    socket.receive(activeState());
    pc.logout();
    expect(socket.sent.at(-1)).toEqual({ type: 'logout' });
    socket.receive({ type: 'sessionEnded', sessionId: SESSION_ID, reason: 'customer' });
    expect(pc.snapshot().sessionId).toBeNull();
  });

  it('REQ-002-03: pide pausa y reanudar, pero solo el state del nodo cambia la cuenta', () => {
    const socket = boot();
    socket.receive(activeState(3600));
    pc.pause();
    expect(socket.sent.at(-1)).toEqual({ type: 'pause' });
    advance(10_000);
    expect(pc.snapshot().localRemainingSeconds).toBe(3590);
    socket.receive(pausedState());
    advance(600_000);
    expect(pc.snapshot()).toMatchObject({ localRemainingSeconds: 3600, pause: { billing: false } });
    expect(socket.sent.at(-1)).toMatchObject({ type: 'heartbeat', localRemainingSeconds: 3600 });
    pc.resume();
    expect(socket.sent.at(-1)).toEqual({ type: 'resume' });
    advance(10_000);
    expect(pc.snapshot().localRemainingSeconds).toBe(3600);
    socket.receive(activeState(3600));
    advance(10_000);
    expect(pc.snapshot()).toMatchObject({ pause: null, localRemainingSeconds: 3590 });
  });

  it('REQ-002-30: sin red conserva la pausa y reconecta con el restante detenido', () => {
    const socket = boot();
    socket.receive(pausedState());
    pc.networkCut(1200);
    pc.resume();
    expect(socket.sent.at(-1)).not.toEqual({ type: 'resume' });
    advance(1_200_000);
    expect(pc.snapshot()).toMatchObject({ pause: { billing: false }, localRemainingSeconds: 3600 });
    last().open();
    expect(last().sent[0]).toMatchObject({ sessionId: SESSION_ID, localRemainingSeconds: 3600 });
    // Superar maxUntil y los mensajes de la conexión vieja no cambian la pausa.
    socket.receive(activeState(3600));
    expect(pc.snapshot().pause).not.toBeNull();
  });

  it('REQ-002-22: una pausa vencida vuelve a contar cuando el nodo comunica billing', () => {
    const socket = boot();
    socket.receive(pausedState());
    socket.receive(pausedState(true));
    advance(10_000);
    expect(pc.snapshot()).toMatchObject({ pause: { billing: true }, localRemainingSeconds: 3590 });
    pc.networkCut(20);
    advance(20_000);
    expect(pc.snapshot().localRemainingSeconds).toBe(3570);
  });

  it('REQ-002-03: un rechazo del nodo no pausa y el cierre limpia la pausa', () => {
    const socket = boot();
    socket.receive(activeState(3600));
    pc.pause();
    socket.receive({ type: 'error', code: 'pause_unavailable', message: 'Sin pausas disponibles' });
    advance(10_000);
    expect(pc.snapshot()).toMatchObject({ pause: null, localRemainingSeconds: 3590 });
    socket.receive(pausedState());
    socket.receive({ type: 'sessionEnded', sessionId: SESSION_ID, reason: 'pause_expired' });
    expect(pc.snapshot()).toMatchObject({
      pause: null,
      sessionId: null,
      localRemainingSeconds: null,
    });
    socket.receive(pausedState());
    socket.receive(LOCKED);
    expect(pc.snapshot().pause).toBeNull();
  });

  it('stop cancela todos los temporizadores', () => {
    const socket = boot();
    pc.stop();
    expect(vi.getTimerCount()).toBe(0);
    advance(60_000);
    expect(socket.sent).toHaveLength(1);
  });
});
