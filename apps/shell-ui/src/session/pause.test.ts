import { type NodeToPcMessage, nodeToPcMessageSchema } from '@pope/shared';
import { describe, expect, it } from 'vitest';

import { PAUSE_FAILED_MESSAGE, pauseReply, RESUME_FAILED_MESSAGE } from './pause.js';

const SESSION_ID = '01900000-0000-7000-8000-0000000000aa';

const active = (requestId?: string): NodeToPcMessage =>
  nodeToPcMessageSchema.parse({
    type: 'state',
    status: 'active',
    vesRate: null,
    ...(requestId !== undefined && { requestId }),
    session: {
      kind: 'account',
      sessionId: SESSION_ID,
      startedAt: '2026-10-03T22:00:00.000Z',
      username: 'juan',
      ratePerHour: { micros: 1_500_000, currency: 'USD' },
      comboSeconds: 0,
      money: { micros: 1_500_000, currency: 'USD' },
      moneySeconds: 3600,
      remainingSeconds: 3600,
    },
  });

describe('respuestas a pause y resume (T15, REQ-002-01, REQ-002-10)', () => {
  it('el state con su requestId es la respuesta; uno de latido, no', () => {
    expect(pauseReply(active('p-1'), 'p-1')).toEqual({ ok: true });
    expect(pauseReply(active(), 'p-1')).toBeNull();
    expect(pauseReply(active('otro'), 'p-1')).toBeNull();
  });

  it('CA-002-04, CA-002-06: el rechazo del nodo trae su motivo', () => {
    const error: NodeToPcMessage = {
      type: 'error',
      code: 'pause_unavailable',
      message: 'Sin pausas disponibles hoy',
      requestId: 'p-1',
    };
    expect(pauseReply(error, 'p-1')).toEqual({ ok: false, message: 'Sin pausas disponibles hoy.' });
  });

  it('un fallo inesperado del nodo da un texto propio, distinto al pausar y al reanudar', () => {
    const error: NodeToPcMessage = {
      type: 'error',
      code: 'internal_error',
      message: 'Error inesperado del nodo',
      requestId: 'p-1',
    };
    expect(pauseReply(error, 'p-1')).toEqual({ ok: false, message: PAUSE_FAILED_MESSAGE });
    expect(pauseReply(error, 'p-1', RESUME_FAILED_MESSAGE)).toEqual({
      ok: false,
      message: RESUME_FAILED_MESSAGE,
    });
  });
});
