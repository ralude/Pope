import { describe, expect, it } from 'vitest';

import type { NodeToPcMessage } from '@pope/shared';

import { loginReply, missingField, UNEXPECTED_MESSAGE } from './login.js';

const LOCKED: NodeToPcMessage = { type: 'state', status: 'locked' };

function error(
  code: Extract<NodeToPcMessage, { type: 'error' }>['code'],
  message: string,
  requestId?: string,
): NodeToPcMessage {
  return { type: 'error', code, message, ...(requestId !== undefined && { requestId }) };
}

describe('missingField', () => {
  it('pide el usuario y luego la contraseña', () => {
    expect(missingField('  ', 'x')).toBe('Escribe tu usuario.');
    expect(missingField('juan', '')).toBe('Escribe tu contraseña.');
    expect(missingField('juan', '1234')).toBeNull();
  });
});

describe('loginReply (REQ-001-20, REQ-001-52)', () => {
  it('una sesión activa es un login correcto', () => {
    const active = {
      type: 'state',
      status: 'active',
      vesRate: null,
      session: {
        kind: 'temporary',
        sessionId: '01900000-0000-7000-8000-000000000001',
        startedAt: '2026-10-01T22:00:00.000Z',
        name: 'Carlos',
        purchasedSeconds: 1500,
        remainingSeconds: 1500,
      },
    } as NodeToPcMessage;
    expect(loginReply(active, 'r1')).toEqual({ ok: true });
  });

  it('muestra el motivo que da el nodo, como frase', () => {
    expect(
      loginReply(error('invalid_credentials', 'Usuario o contraseña incorrectos', 'r1'), 'r1'),
    ).toEqual({ ok: false, message: 'Usuario o contraseña incorrectos.' });
    expect(
      loginReply(
        error('account_locked', 'Demasiados intentos fallidos. Prueba de nuevo en 4 min', 'r1'),
        'r1',
      ),
    ).toEqual({ ok: false, message: 'Demasiados intentos fallidos. Prueba de nuevo en 4 min.' });
  });

  it('no repite el punto si el nodo ya lo puso', () => {
    expect(loginReply(error('account_inactive', 'Habla con el encargado.', 'r1'), 'r1')).toEqual({
      ok: false,
      message: 'Habla con el encargado.',
    });
  });

  it('los fallos del protocolo o del nodo dan un mensaje genérico', () => {
    expect(loginReply(error('internal_error', 'Error inesperado del nodo', 'r1'), 'r1')).toEqual({
      ok: false,
      message: UNEXPECTED_MESSAGE,
    });
  });

  it('ignora lo que no responde a ese login', () => {
    expect(loginReply(LOCKED, 'r1')).toBeNull();
    expect(loginReply(error('invalid_credentials', 'x', 'otro'), 'r1')).toBeNull();
    expect(
      loginReply(error('unknown_pc', 'Esta PC no está registrada en el nodo'), 'r1'),
    ).toBeNull();
  });
});
