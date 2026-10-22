import {
  micros,
  type PcCommandResponse,
  pcCommandRequestSchema,
  type PcControlContext,
  type PcMapItem,
  type PcMapSession,
  seconds,
} from '@pope/shared';
import { describe, expect, it, vi } from 'vitest';

import { ApiClient } from '../api/client.js';
import {
  availableActions,
  buildRequest,
  commandErrorMessage,
  confirmationFor,
  continuePc,
  countdown,
  getCommand,
  getControl,
  issueCommand,
  outcomeOf,
  revokePc,
  wakePc,
  wakeStatus,
  wakeText,
} from './controls.js';

const ID = (n: number) => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const NOW = new Date('2026-10-22T20:00:00Z');

const session = (over: Partial<PcMapSession> = {}): PcMapSession => ({
  sessionId: ID(100),
  kind: 'account',
  customerId: ID(101),
  who: 'juan',
  openedBy: 'juan',
  startedAt: '2026-10-22T19:00:00.000Z',
  remainingSeconds: seconds(1800),
  billedUntil: NOW.toISOString(),
  rateMicrosPerHour: micros(1_500_000),
  amountMicros: micros(250_000),
  comboSeconds: seconds(0),
  ending: false,
  pause: null,
  pausesUsed: { inSession: 0, today: 0 },
  ...over,
});

const pc = (over: Partial<PcMapItem> = {}): PcMapItem => ({
  id: ID(4),
  name: 'PC 04',
  row: null,
  col: null,
  connected: true,
  session: null,
  wake: null,
  maintenance: null,
  canWake: true,
  hold: null,
  order: null,
  ...over,
});

const maintenance = {
  id: ID(200),
  actorName: 'Luis',
  source: 'panel' as const,
  startedAt: '2026-10-22T19:30:00.000Z',
};

const enabled = (item: PcMapItem, role: 'encargado' | 'administrador' | 'dueno' = 'encargado') =>
  availableActions(item, role)
    .filter((state) => state.enabled)
    .map((state) => state.action);

describe('acciones disponibles según el estado (REQ-003-20, REQ-003-22, REQ-003-43)', () => {
  it('PC libre: bloquear, mensaje, reiniciar, apagar e iniciar como administrador', () => {
    expect(enabled(pc())).toEqual([
      'lock',
      'message',
      'restart',
      'powerOff',
      'startMaintenance',
      'revoke',
    ]);
  });

  it('con sesión, activa, temporal o en pausa, no se puede iniciar como administrador', () => {
    for (const s of [
      session(),
      session({ kind: 'temporary', customerId: null }),
      session({
        pause: {
          startedAt: NOW.toISOString(),
          maxUntil: NOW.toISOString(),
          billing: false,
        },
      }),
    ]) {
      expect(enabled(pc({ session: s }))).toEqual([
        'lock',
        'message',
        'restart',
        'powerOff',
        'revoke',
      ]);
    }
    const blocked = availableActions(pc({ session: session() }), 'encargado').find(
      (state) => state.action === 'startMaintenance',
    );
    expect(blocked).toMatchObject({ enabled: false, reason: 'Cierra antes la sesión' });
  });

  it('en mantenimiento: terminar, reiniciar y apagar; sin bloquear ni mensajes', () => {
    expect(enabled(pc({ maintenance }))).toEqual(['restart', 'powerOff', 'endMaintenance']);
  });

  it('desconectada: solo encender, y solo si tiene la MAC registrada', () => {
    // Revocar sí se puede con la PC apagada: su credencial sigue vigente (T34).
    expect(enabled(pc({ connected: false }))).toEqual(['wake', 'revoke']);
    const withoutMac = availableActions(pc({ connected: false, canWake: false }), 'encargado');
    expect(withoutMac.filter((state) => state.enabled).map((state) => state.action)).toEqual([
      'revoke',
    ]);
    expect(withoutMac.find((state) => state.action === 'wake')?.reason).toBe(
      'Sin tarjeta de red registrada',
    );
    // Encender una PC conectada no tiene sentido.
    expect(availableActions(pc(), 'encargado').find((s) => s.action === 'wake')?.reason).toBe(
      'La PC ya está conectada',
    );
  });

  it('con una orden en curso, solo se admiten mensajes', () => {
    const busy = pc({ order: { id: ID(300), kind: 'restart', status: 'requested' } });
    expect(enabled(busy)).toEqual(['message']);
    expect(availableActions(busy, 'encargado').find((s) => s.action === 'lock')?.reason).toBe(
      'Orden en curso',
    );
  });

  it('el dueño solo mira: todo desactivado y «Solo lectura»', () => {
    for (const item of [pc(), pc({ connected: false }), pc({ maintenance })]) {
      expect(enabled(item, 'dueno')).toEqual([]);
      expect(availableActions(item, 'dueno').every((s) => s.reason === 'Solo lectura')).toBe(true);
    }
    expect(enabled(pc(), 'administrador')).toEqual(enabled(pc()));
  });
});

describe('confirmaciones (mantenedor 2026-10-22: Bloquear siempre confirma)', () => {
  it('bloquear pide confirmación con la PC libre, con cuenta y con temporal', () => {
    expect(confirmationFor('lock', pc(), NOW)).toMatchObject({
      title: 'Bloquear la PC 04',
      body: 'La PC 04 quedará bloqueada.',
    });
    expect(confirmationFor('lock', pc({ session: session() }), NOW)?.body).toBe(
      'Se cerrará la sesión de juan y la PC 04 quedará bloqueada.',
    );
    const temporary = session({ kind: 'temporary', customerId: null, who: 'Carlos' });
    expect(confirmationFor('lock', pc({ session: temporary }), NOW)?.body).toBe(
      'Se cerrará la sesión de Carlos y la PC 04 quedará bloqueada. Se perderán 30 min de la sesión temporal.',
    );
  });

  it('el tiempo perdido de una temporal descuenta lo que ya pasó desde el último cobro', () => {
    const temporary = session({
      kind: 'temporary',
      customerId: null,
      who: 'Carlos',
      remainingSeconds: seconds(600),
      billedUntil: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
    });
    expect(confirmationFor('lock', pc({ session: temporary }), NOW)?.body).toContain(
      'Se perderán 5 min',
    );
  });

  it('reiniciar y apagar solo confirman con sesión o mantenimiento', () => {
    expect(confirmationFor('restart', pc(), NOW)).toBeNull();
    expect(confirmationFor('powerOff', pc(), NOW)).toBeNull();
    expect(confirmationFor('restart', pc({ session: session() }), NOW)?.body).toBe(
      'Se cerrará la sesión de juan y después se reiniciará la PC 04.',
    );
    expect(confirmationFor('powerOff', pc({ maintenance }), NOW)?.body).toBe(
      'Se terminará el mantenimiento de Luis y después se apagará la PC 04.',
    );
  });

  it('encender, mensaje y mantenimiento se hacen al pulsar', () => {
    for (const action of ['wake', 'message', 'startMaintenance', 'endMaintenance'] as const) {
      expect(confirmationFor(action, pc(), NOW)).toBeNull();
    }
  });
});

describe('peticiones al nodo', () => {
  const free: PcControlContext = { kind: 'free', revision: ID(1) };
  const inSession: PcControlContext = { kind: 'session', revision: ID(1), sessionId: ID(100) };
  const inMaintenance: PcControlContext = {
    kind: 'maintenance',
    revision: ID(1),
    maintenanceId: ID(200),
  };

  it('cada acción produce una petición que cumple el contrato del nodo', () => {
    const built = [
      buildRequest('lock', free, ID(10)),
      buildRequest('lock', inSession, ID(10)),
      buildRequest('message', free, ID(10), 'Hola'),
      buildRequest('startMaintenance', free, ID(10)),
      buildRequest('endMaintenance', inMaintenance, ID(10)),
      buildRequest('restart', free, ID(10)),
      buildRequest('powerOff', inSession, ID(10)),
      buildRequest('restart', inMaintenance, ID(10)),
    ];
    for (const request of built) {
      expect(request).not.toBeNull();
      expect(pcCommandRequestSchema.safeParse(request).success).toBe(true);
    }
  });

  it('reiniciar o apagar con sesión o mantenimiento llevan confirmed; con la PC libre, no', () => {
    expect(buildRequest('restart', free, ID(10))).not.toHaveProperty('confirmed');
    expect(buildRequest('restart', inSession, ID(10))).toMatchObject({ confirmed: true });
    expect(buildRequest('powerOff', inMaintenance, ID(10))).toMatchObject({ confirmed: true });
  });

  it('una acción que no corresponde al contexto no produce petición', () => {
    expect(buildRequest('startMaintenance', inSession, ID(10))).toBeNull();
    expect(buildRequest('endMaintenance', free, ID(10))).toBeNull();
    expect(buildRequest('lock', inMaintenance, ID(10))).toBeNull();
    expect(buildRequest('message', inMaintenance, ID(10), 'x')).toBeNull();
  });

  it('el mismo ID se conserva para el reintento y el doble clic', () => {
    expect(buildRequest('lock', free, ID(10))).toEqual(buildRequest('lock', free, ID(10)));
  });
});

describe('resultado de una orden', () => {
  const response = (
    kind: 'lock' | 'restart' | 'powerOff' | 'showMessage' | 'startMaintenance',
    status: PcCommandResponse['status'],
    lastResult: PcCommandResponse['lastResult'] = null,
  ): PcCommandResponse => ({
    command: {
      id: ID(10),
      pcId: ID(4),
      actor: { kind: 'staff', staffId: ID(1), name: 'Ana' },
      expected: { kind: 'free', revision: ID(2) },
      issuedAt: '2026-10-22T20:00:00.000Z',
      expiresAt: '2026-10-22T20:00:30.000Z',
      action:
        kind === 'showMessage'
          ? { kind, text: 'Hola' }
          : kind === 'startMaintenance'
            ? { kind, maintenanceId: ID(200), source: 'panel' }
            : { kind },
    },
    status,
    lastResult,
  });

  it('sigue hasta el efecto: pedida y aceptada de un bloqueo no son finales', () => {
    expect(outcomeOf(response('lock', 'requested'))).toMatchObject({ done: false });
    expect(outcomeOf(response('lock', 'accepted'))).toMatchObject({ done: false });
    expect(outcomeOf(response('lock', 'applied'))).toEqual({
      done: true,
      ok: true,
      text: 'PC bloqueada.',
    });
  });

  it('reiniciar y apagar terminan en la aceptación de Windows, sin afirmar el apagado', () => {
    expect(outcomeOf(response('restart', 'accepted'))).toEqual({
      done: true,
      ok: true,
      text: 'Windows aceptó reiniciar la PC.',
    });
    expect(outcomeOf(response('powerOff', 'accepted')).text).toBe('Windows aceptó apagar la PC.');
    expect(outcomeOf(response('powerOff', 'accepted')).text).not.toMatch(/apagada/);
  });

  it('un fallo muestra el motivo de la PC; vencida y cancelada tienen su texto', () => {
    const failed = response('lock', 'failed', {
      status: 'failed',
      kind: 'lock',
      code: 'native_failure',
      message: 'Quedan procesos del cliente abiertos.',
    });
    expect(outcomeOf(failed)).toEqual({
      done: true,
      ok: false,
      text: 'Quedan procesos del cliente abiertos.',
    });
    expect(outcomeOf(response('lock', 'expired'))).toMatchObject({ done: true, ok: false });
    expect(outcomeOf(response('lock', 'cancelled'))).toMatchObject({ done: true, ok: false });
    expect(outcomeOf(response('showMessage', 'applied')).text).toBe('Mensaje enviado.');
    expect(outcomeOf(response('startMaintenance', 'applied')).text).toBe('Mantenimiento iniciado.');
  });
});

describe('encendido en el mapa (REQ-003-22)', () => {
  const wake = (deadlineMs: number) => ({
    requestId: ID(50),
    requestedAt: new Date(deadlineMs - 120_000).toISOString(),
    deadline: new Date(deadlineMs).toISOString(),
  });

  it('cuenta atrás hasta los 2 min y después avisa sin diagnosticar avería', () => {
    expect(wakeStatus(pc(), NOW)).toBeNull();
    const item = pc({ connected: false, wake: wake(NOW.getTime() + 65_000) });
    expect(wakeStatus(item, NOW)).toEqual({ kind: 'starting', secondsLeft: 65 });
    expect(wakeText({ kind: 'starting', secondsLeft: 65 })).toBe('Encendiendo… (1:05)');
    const late = new Date(NOW.getTime() + 66_000);
    expect(wakeStatus(item, late)).toEqual({ kind: 'overdue' });
    expect(wakeText({ kind: 'overdue' })).toMatch(/No se conectó en 2 min/);
    expect(wakeText({ kind: 'overdue' })).not.toMatch(/aver/i);
    expect(countdown(9)).toBe('0:09');
  });
});

describe('errores del nodo', () => {
  it('cada código tiene su texto y, si no, se usa el mensaje del nodo', () => {
    expect(commandErrorMessage('stale_context', 'x')).toBe(
      'La PC cambió de estado. Revisa el mapa y vuelve a intentarlo.',
    );
    expect(commandErrorMessage('pc_disconnected', 'x')).toBe('La PC no está conectada.');
    expect(commandErrorMessage('mac_unknown', 'x')).toBe(
      'La PC no tiene registrada su tarjeta de red.',
    );
    expect(commandErrorMessage(null, 'Mensaje del nodo')).toBe('Mensaje del nodo');
    expect(commandErrorMessage('otro', 'Mensaje del nodo')).toBe('Mensaje del nodo');
  });
});

describe('llamadas al nodo', () => {
  function fakeFetch(status: number, body: unknown) {
    const calls: { url: string; method?: string; body?: unknown }[] = [];
    const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        ...(init?.method !== undefined && { method: init.method }),
        ...(typeof init?.body === 'string' && { body: JSON.parse(init.body) as unknown }),
      });
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    });
    return { fn: fn as unknown as typeof fetch, calls };
  }

  const control = {
    context: { kind: 'free', revision: ID(1) },
    connected: true,
    reservation: null,
  };

  it('lee el contexto, envía la orden, consulta su resultado y enciende', async () => {
    const read = fakeFetch(200, control);
    expect(await getControl(new ApiClient({ fetch: read.fn }), ID(4))).toEqual(control);
    expect(read.calls[0]?.url).toBe(`/pcs/${ID(4)}/control`);

    const request = buildRequest('lock', { kind: 'free', revision: ID(1) }, ID(10));
    if (!request) throw new Error('Sin petición');
    const answer = {
      command: {
        id: ID(10),
        pcId: ID(4),
        actor: { kind: 'staff', staffId: ID(1), name: 'Ana' },
        expected: { kind: 'free', revision: ID(1) },
        issuedAt: '2026-10-22T20:00:00.000Z',
        expiresAt: '2026-10-22T20:00:30.000Z',
        action: { kind: 'lock' },
      },
      status: 'requested',
      lastResult: null,
    };
    const post = fakeFetch(200, answer);
    await issueCommand(new ApiClient({ fetch: post.fn }), ID(4), request);
    expect(post.calls[0]).toMatchObject({
      url: `/pcs/${ID(4)}/commands`,
      method: 'POST',
      body: request,
    });
    const poll = fakeFetch(200, answer);
    await getCommand(new ApiClient({ fetch: poll.fn }), ID(4), ID(10));
    expect(poll.calls[0]?.url).toBe(`/pcs/${ID(4)}/commands/${ID(10)}`);

    const wakeCalls = fakeFetch(200, {
      pcId: ID(4),
      wake: {
        requestId: ID(50),
        requestedAt: '2026-10-22T20:00:00.000Z',
        deadline: '2026-10-22T20:02:00.000Z',
      },
    });
    await wakePc(new ApiClient({ fetch: wakeCalls.fn }), ID(4), ID(50));
    expect(wakeCalls.calls[0]).toMatchObject({ url: `/pcs/${ID(4)}/wake`, body: { id: ID(50) } });
  });

  it('una respuesta que no cumple el contrato se rechaza', async () => {
    const bad = fakeFetch(200, { context: { kind: 'otro' } });
    await expect(getControl(new ApiClient({ fetch: bad.fn }), ID(4))).rejects.toThrow();
  });
});

describe('sesión retenida por una revocación (T34i, REQ-003-11)', () => {
  const hold = (relinked: boolean) => ({
    sessionId: ID(100),
    since: '2026-10-22T19:40:00.000Z',
    byName: 'Ana',
    relinked,
  });

  it('retenida y sin credencial nueva: solo el código de recuperación', () => {
    const item = pc({ connected: false, session: session(), hold: hold(false) });
    expect(enabled(item)).toEqual(['recoveryCode']);
    const states = availableActions(item, 'encargado');
    expect(states.find((state) => state.action === 'continue')?.reason).toBe(
      'Introduce antes el código en la PC',
    );
    expect(states.find((state) => state.action === 'revoke')?.reason).toBe('Ya está revocada');
    expect(states.find((state) => state.action === 'lock')?.reason).toMatch(/retenida/);
  });

  it('revinculada pero sin conexión no se puede continuar; conectada, sí', () => {
    const offline = pc({ connected: false, session: session(), hold: hold(true) });
    expect(enabled(offline)).toEqual(['recoveryCode']);
    expect(
      availableActions(offline, 'encargado').find((state) => state.action === 'continue')?.reason,
    ).toBe('La PC no está conectada');
    expect(enabled(pc({ session: session(), hold: hold(true) }))).toEqual([
      'recoveryCode',
      'continue',
    ]);
  });

  it('sin retención no hay código de recuperación ni continuar; el dueño nada', () => {
    const states = availableActions(pc(), 'encargado');
    expect(states.find((state) => state.action === 'recoveryCode')?.enabled).toBe(false);
    expect(states.find((state) => state.action === 'continue')?.enabled).toBe(false);
    expect(enabled(pc({ session: session(), hold: hold(true) }), 'dueno')).toEqual([]);
  });

  it('revocar confirma y avisa de que la sesión queda retenida, sin cobro', () => {
    expect(confirmationFor('revoke', pc({ session: session() }), NOW)?.body).toBe(
      'La PC 04 dejará de poder conectar con el nodo. La sesión de juan quedará retenida, sin cobro, hasta que la PC se registre de nuevo y autorices continuar.',
    );
    expect(confirmationFor('revoke', pc(), NOW)?.body).toMatch(/hasta que se registre de nuevo/);
    expect(confirmationFor('continue', pc(), NOW)).toBeNull();
  });

  it('los códigos de revocación tienen su texto', () => {
    expect(commandErrorMessage('pc_not_relinked', 'x')).toMatch(/introduce el código en la PC/);
    expect(commandErrorMessage('pc_not_held', 'x')).toMatch(/ya no está retenida/);
    expect(commandErrorMessage('pc_not_registered', 'x')).toMatch(/credencial vigente/);
  });

  it('revocar y continuar llaman al nodo con su ID y la sesión', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const respond = (body: unknown) =>
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
          body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
        });
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
      }) as unknown as typeof fetch;
    const pcRef = { id: ID(4), name: 'PC 04' };
    await revokePc(
      new ApiClient({
        fetch: respond({
          pc: pcRef,
          revokedAt: '2026-10-22T20:00:00.000Z',
          heldSessionId: ID(100),
        }),
      }),
      ID(4),
      ID(10),
    );
    await continuePc(
      new ApiClient({ fetch: respond({ sessionId: ID(100), heldSeconds: 1200 }) }),
      ID(4),
      ID(11),
      ID(100),
    );
    expect(calls).toEqual([
      { url: `/pcs/${ID(4)}/revoke`, body: { id: ID(10) } },
      { url: `/pcs/${ID(4)}/continue`, body: { id: ID(11), sessionId: ID(100) } },
    ]);
  });
});
