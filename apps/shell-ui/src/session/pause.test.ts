import { type NodeToPcMessage, nodeToPcMessageSchema } from '@pope/shared';
import { describe, expect, it } from 'vitest';

import {
  formatPauseLeft,
  PAUSE_FAILED_MESSAGE,
  pauseButton,
  pauseMaxText,
  pauseReply,
  pausesLeftText,
  RESUME_FAILED_MESSAGE,
} from './pause.js';

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

describe('botón Pausar y confirmación (T16, REQ-002-01, REQ-002-02)', () => {
  const session = (over: object) => {
    const message = active();
    if (message.type !== 'state' || message.status !== 'active') throw new Error('state');
    return { ...message.session, ...over };
  };

  it('con pausas, el botón está activo', () => {
    expect(pauseButton(session({ pausesLeft: 2, pauseLimit: null }))).toEqual({
      visible: true,
      blocked: false,
      reason: null,
    });
  });

  it('CA-002-04, CA-002-06: sin pausas, apagado y con el motivo de su límite', () => {
    expect(pauseButton(session({ pausesLeft: 0, pauseLimit: 'session' })).reason).toBe(
      'Sin pausas disponibles',
    );
    expect(pauseButton(session({ pausesLeft: 0, pauseLimit: 'day' }))).toEqual({
      visible: true,
      blocked: true,
      reason: 'Sin pausas disponibles hoy',
    });
  });

  it('REQ-002-23: con la pausa desactivada, apagado y con su mensaje', () => {
    expect(pauseButton(session({ pausesLeft: 0, pauseLimit: 'disabled' })).reason).toBe(
      'La pausa no está disponible en este local',
    );
  });

  it('CA-002-07: en una sesión temporal no aparece', () => {
    const temporary = nodeToPcMessageSchema.parse({
      type: 'state',
      status: 'active',
      vesRate: null,
      session: {
        kind: 'temporary',
        sessionId: SESSION_ID,
        startedAt: '2026-10-03T22:00:00.000Z',
        name: 'Carlos',
        purchasedSeconds: 3600,
        remainingSeconds: 3600,
      },
    });
    if (temporary.type !== 'state' || temporary.status !== 'active') throw new Error('state');
    expect(pauseButton(temporary.session).visible).toBe(false);
  });

  it('un nodo que no manda las pausas que quedan deja el botón apagado, sin motivo', () => {
    expect(pauseButton(session({}))).toEqual({ visible: true, blocked: true, reason: null });
  });

  it('dice cuántas pausas quedan y cuánto dura una', () => {
    expect(pausesLeftText(2)).toBe('Te quedan 2 pausas');
    expect(pausesLeftText(1)).toBe('Te queda 1 pausa');
    expect(pauseMaxText(900)).toBe('15 min');
    expect(pauseMaxText(3600)).toBe('60 min');
  });
});

describe('pantalla de pausa (T17, REQ-002-06)', () => {
  it('el tiempo de pausa va sin segundos, salvo el último minuto', () => {
    expect(formatPauseLeft(900)).toBe('15 min');
    expect(formatPauseLeft(661)).toBe('12 min');
    expect(formatPauseLeft(61)).toBe('2 min');
    expect(formatPauseLeft(60)).toBe('60 s');
    expect(formatPauseLeft(45)).toBe('45 s');
    expect(formatPauseLeft(0)).toBe('0 s');
  });
});
