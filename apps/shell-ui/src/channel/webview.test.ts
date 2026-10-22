import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChannelEvent } from './channel.js';
import { applyEvent, INITIAL_FEED } from './feed.js';
import { WebViewChannel, type WebViewBridge } from './webview.js';

class FakeBridge implements WebViewBridge {
  sent: unknown[] = [];
  listeners = new Set<(event: { data: unknown }) => void>();
  postMessage(message: unknown): void {
    this.sent.push(message);
  }
  addEventListener(_type: 'message', listener: (event: { data: unknown }) => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'message', listener: (event: { data: unknown }) => void): void {
    this.listeners.delete(listener);
  }
  receive(data: unknown): void {
    for (const listener of this.listeners) listener({ data });
  }
}
const status = (value: 'online' | 'offline') => ({
  version: 1,
  kind: 'status',
  status: value,
  pcName: 'PC registrada',
});

describe('REQ-003-03/04/63: canal WebView2', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('preserva correlación, identidad y edad del estado sin hello ni latidos', () => {
    vi.useFakeTimers();
    const bridge = new FakeBridge();
    const channel = new WebViewChannel(bridge);
    const events: ChannelEvent[] = [];
    channel.start((event) => events.push(event));
    bridge.receive(status('online'));
    expect(channel.send({ type: 'pause', requestId: 'r1' })).toBe(true);
    expect(bridge.sent.at(-1)).toEqual({
      version: 1,
      kind: 'request',
      request: { type: 'pause', requestId: 'r1' },
    });
    bridge.receive({
      version: 1,
      kind: 'message',
      elapsedSeconds: 12,
      message: {
        type: 'error',
        code: 'pause_unavailable',
        message: 'No disponible',
        requestId: 'r1',
      },
    });
    expect(events.at(-1)).toMatchObject({ kind: 'message', message: { requestId: 'r1' } });
    bridge.receive({
      version: 1,
      kind: 'message',
      elapsedSeconds: 12,
      message: { type: 'state', status: 'locked' },
    });
    const snapshot = events.at(-1);
    const online = events[1];
    if (!snapshot || !online) throw new Error('Falta la respuesta del puente');
    expect(snapshot).toEqual({
      kind: 'message',
      message: { type: 'state', status: 'locked' },
      elapsedSeconds: 12,
    });
    const feed = applyEvent(applyEvent(INITIAL_FEED, online, 100), snapshot, 2000);
    expect(feed.pcName).toBe('PC registrada');
    expect(feed.stateAt).toBe(-10_000);
    vi.advanceTimersByTime(60_000);
    expect(bridge.sent).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
    channel.stop();
  });

  it('offline impide solicitudes y una nueva conexión no reenvía la anterior', () => {
    const bridge = new FakeBridge();
    const channel = new WebViewChannel(bridge);
    const events: ChannelEvent[] = [];
    channel.start((event) => events.push(event));
    bridge.receive(status('online'));
    expect(channel.send({ type: 'logout', requestId: 'old' })).toBe(true);
    bridge.receive(status('offline'));
    expect(channel.send({ type: 'logout', requestId: 'lost' })).toBe(false);
    bridge.receive(status('online'));
    expect(bridge.sent).toHaveLength(2);
    channel.stop();
  });

  it('ready reintenta con tope; start/stop limpia listeners y timers incluso tras StrictMode', () => {
    vi.useFakeTimers();
    const bridge = new FakeBridge();
    const channel = new WebViewChannel(bridge);
    let calls = 0;
    channel.start(() => {
      calls++;
    });
    channel.start(() => {
      calls++;
    });
    expect(bridge.listeners.size).toBe(1);
    vi.advanceTimersByTime(61_000);
    expect(bridge.sent.every((m) => JSON.stringify(m) === '{"version":1,"kind":"ready"}')).toBe(
      true,
    );
    const count = bridge.sent.length;
    vi.advanceTimersByTime(29_999);
    expect(bridge.sent).toHaveLength(count);
    vi.advanceTimersByTime(1);
    expect(bridge.sent).toHaveLength(count + 1);
    channel.stop();
    const before = calls;
    bridge.receive(status('online'));
    vi.advanceTimersByTime(120_000);
    expect(calls).toBe(before);
    expect(bridge.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rechaza órdenes, campos extra, versiones/edad incorrectas y frames excesivos', () => {
    const bridge = new FakeBridge();
    const channel = new WebViewChannel(bridge);
    const events: ChannelEvent[] = [];
    channel.start((event) => events.push(event));
    for (const data of [
      { ...status('online'), credential: 'secret' },
      { ...status('online'), version: 2 },
      {
        version: 1,
        kind: 'message',
        elapsedSeconds: -1,
        message: { type: 'state', status: 'locked' },
      },
      {
        version: 1,
        kind: 'message',
        elapsedSeconds: 0,
        message: { type: 'command', action: 'lock' },
      },
      { ...status('online'), pcName: 'x'.repeat(16_384) },
      '{invalid}',
    ])
      bridge.receive(data);
    expect(events).toEqual([{ kind: 'status', status: 'connecting' }]);
    expect(channel.send({ type: 'logout' })).toBe(false);
    bridge.receive(status('online'));
    expect(channel.send({ type: 'login', username: 'x', password: 'x'.repeat(16_384) })).toBe(
      false,
    );
    channel.stop();
  });

  it('sin WebView2 informa offline y nunca abre un WebSocket de reemplazo', () => {
    const events: ChannelEvent[] = [];
    const channel = new WebViewChannel(undefined);
    channel.start((event) => events.push(event));
    expect(events).toEqual([
      { kind: 'status', status: 'connecting' },
      { kind: 'status', status: 'offline' },
    ]);
    expect(channel.send({ type: 'logout' })).toBe(false);
    channel.stop();
  });

  it('REQ-003-40/T38: envía el login técnico y la salida, y recibe el mantenimiento y sus errores', () => {
    const bridge = new FakeBridge();
    const channel = new WebViewChannel(bridge);
    const events: ChannelEvent[] = [];
    channel.start((event) => events.push(event));
    bridge.receive(status('online'));
    const requestId = '01900000-0000-7000-8000-000000000001';
    const login = {
      type: 'technicalLogin',
      requestId,
      username: 'ana',
      password: 'secreto',
    } as const;
    expect(channel.send(login)).toBe(true);
    expect(bridge.sent.at(-1)).toEqual({ version: 1, kind: 'request', request: login });
    const exit = {
      type: 'endMaintenance',
      requestId,
      maintenanceId: '01900000-0000-7000-8000-0000000000aa',
    } as const;
    expect(channel.send(exit)).toBe(true);
    // Una petición con campos de más no sale del Shell.
    expect(channel.send({ ...login, actor: 'ana' } as never)).toBe(false);

    const error = {
      type: 'technicalError',
      requestId,
      code: 'invalid_credentials',
      message: 'Usuario o contraseña incorrectos',
    };
    bridge.receive({ version: 1, kind: 'message', elapsedSeconds: 0, message: error });
    expect(events.at(-1)).toMatchObject({ kind: 'message', message: error });
    const state = { type: 'maintenanceState', maintenance: null, requestId };
    bridge.receive({ version: 1, kind: 'message', elapsedSeconds: 0, message: state });
    expect(events.at(-1)).toMatchObject({ kind: 'message', message: state });
    // Las órdenes y los acuses del agente no llegan a las pantallas.
    const before = events.length;
    bridge.receive({
      version: 1,
      kind: 'message',
      elapsedSeconds: 0,
      message: {
        type: 'controlState',
        context: { kind: 'free', revision: requestId },
        serverTime: '2026-10-22T20:00:00.000Z',
      },
    });
    expect(events).toHaveLength(before);
    channel.stop();
  });
});
