import type { PcMaintenance } from '@pope/shared';
import { describe, expect, it } from 'vitest';

import type { ShellMessage } from '../channel/channel.js';
import { applyEvent, INITIAL_FEED } from '../channel/feed.js';
import { endReply, endRequest, tabText } from './maintenance.js';

const REQUEST = '01900000-0000-7000-8000-000000000001';
const MAINTENANCE: PcMaintenance = {
  id: '01900000-0000-7000-8000-0000000000aa',
  pc: { id: '01900000-0000-7000-8000-000000000004', name: 'PC 04' },
  actor: { kind: 'staff', staffId: '01900000-0000-7000-8000-000000000003', name: 'Luis' },
  source: 'panel',
  startedAt: '2026-10-22T20:00:00.000Z',
};

const state = (maintenance: PcMaintenance | null, requestId?: string): ShellMessage => ({
  type: 'maintenanceState',
  maintenance,
  ...(requestId !== undefined && { requestId }),
});

describe('pestaña «Técnico» (REQ-003-42)', () => {
  it('solo se muestra con un mantenimiento y dice la PC y quién entró, sin tiempo', () => {
    expect(tabText(null)).toBeNull();
    const text = tabText(MAINTENANCE);
    expect(text).toEqual({
      pc: 'PC 04',
      who: 'Luis',
      summary: 'PC 04 · en mantenimiento por Luis',
    });
    expect(JSON.stringify(text)).not.toMatch(/\d+:\d+|min|segundos|20:00/);
  });

  it('el feed la enciende con el mantenimiento y la apaga cuando el nodo lo da por terminado', () => {
    const opened = applyEvent(INITIAL_FEED, { kind: 'message', message: state(MAINTENANCE) }, 0);
    expect(opened.maintenance).toEqual(MAINTENANCE);
    // Perder la conexión no termina el mantenimiento (REQ-003-44).
    const offline = applyEvent(opened, { kind: 'status', status: 'offline' }, 1);
    expect(offline.maintenance).toEqual(MAINTENANCE);
    const closed = applyEvent(offline, { kind: 'message', message: state(null, REQUEST) }, 2);
    expect(closed.maintenance).toBeNull();
  });

  it('un error del login técnico o un estado de sesión no cambian el mantenimiento', () => {
    const opened = applyEvent(INITIAL_FEED, { kind: 'message', message: state(MAINTENANCE) }, 0);
    const error: ShellMessage = {
      type: 'technicalError',
      requestId: REQUEST,
      code: 'invalid_credentials',
      message: 'x',
    };
    expect(applyEvent(opened, { kind: 'message', message: error }, 1).maintenance).toEqual(
      MAINTENANCE,
    );
    expect(
      applyEvent(opened, { kind: 'message', message: { type: 'state', status: 'locked' } }, 1)
        .maintenance,
    ).toEqual(MAINTENANCE);
  });
});

describe('«Terminar y bloquear» (REQ-003-44, CA-003-09)', () => {
  it('pide la salida del mantenimiento por su ID, sin actor ni tiempo', () => {
    expect(endRequest(MAINTENANCE.id, REQUEST)).toEqual({
      type: 'endMaintenance',
      requestId: REQUEST,
      maintenanceId: MAINTENANCE.id,
    });
  });

  it('el agente responde con el mantenimiento vacío y el mismo requestId', () => {
    expect(endReply(state(null, REQUEST), REQUEST)).toEqual({ ok: true });
    expect(endReply(state(null, 'otra'), REQUEST)).toBeNull();
    expect(endReply(state(null), REQUEST)).toBeNull();
    expect(endReply(state(MAINTENANCE, REQUEST), REQUEST)).toBeNull();
  });

  it('un error de esa petición se muestra con su texto; el de otra no', () => {
    const error = (requestId: string): ShellMessage => ({
      type: 'error',
      code: 'internal_error',
      message: 'No se pudo terminar el mantenimiento',
      requestId,
    });
    expect(endReply(error(REQUEST), REQUEST)).toEqual({
      ok: false,
      message: 'No se pudo terminar el mantenimiento.',
    });
    expect(endReply(error('otra'), REQUEST)).toBeNull();
  });
});
