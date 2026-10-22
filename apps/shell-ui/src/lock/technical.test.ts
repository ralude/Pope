import { describe, expect, it } from 'vitest';

import type { ShellMessage } from '../channel/channel.js';
import {
  missingTechnicalField,
  TECHNICAL_UNEXPECTED_MESSAGE,
  technicalReply,
} from './technical.js';

const REQUEST = '01900000-0000-7000-8000-000000000001';
const OTHER = '01900000-0000-7000-8000-000000000002';

function failure(
  code: Extract<ShellMessage, { type: 'technicalError' }>['code'],
  message = 'Texto del nodo',
  extra: { lockedUntil?: string; requestId?: string } = {},
): ShellMessage {
  return { type: 'technicalError', requestId: extra.requestId ?? REQUEST, code, message, ...extra };
}

const AUTHORIZED = (requestId?: string): ShellMessage => ({
  type: 'maintenanceState',
  ...(requestId !== undefined && { requestId }),
  maintenance: {
    id: '01900000-0000-7000-8000-0000000000aa',
    pc: { id: '01900000-0000-7000-8000-000000000004', name: 'PC 04' },
    actor: { kind: 'staff', staffId: '01900000-0000-7000-8000-000000000003', name: 'Ana' },
    source: 'local',
    startedAt: '2026-10-22T20:00:00.000Z',
  },
});

describe('missingTechnicalField (REQ-003-40)', () => {
  it('pide el usuario y luego la contraseña', () => {
    expect(missingTechnicalField('  ', 'x')).toBe('Escribe tu usuario.');
    expect(missingTechnicalField('ana', '')).toBe('Escribe tu contraseña.');
    expect(missingTechnicalField('ana', 'secreto')).toBeNull();
  });
});

describe('technicalReply (REQ-003-40, REQ-003-45)', () => {
  it('el mantenimiento autorizado con su requestId es la entrada correcta', () => {
    expect(technicalReply(AUTHORIZED(REQUEST), REQUEST)).toEqual({ ok: true });
  });

  it('no responde a otra petición, ni a un estado sin requestId o sin mantenimiento', () => {
    expect(technicalReply(AUTHORIZED(OTHER), REQUEST)).toBeNull();
    expect(technicalReply(AUTHORIZED(), REQUEST)).toBeNull();
    expect(
      technicalReply({ type: 'maintenanceState', maintenance: null, requestId: REQUEST }, REQUEST),
    ).toBeNull();
    expect(technicalReply({ type: 'state', status: 'locked' }, REQUEST)).toBeNull();
    expect(technicalReply(failure('invalid_credentials', 'x', { requestId: OTHER }), REQUEST)).toBe(
      null,
    );
  });

  it('muestra el texto del nodo con su punto final', () => {
    expect(
      technicalReply(failure('invalid_credentials', 'Usuario o contraseña incorrectos'), REQUEST),
    ).toEqual({ ok: false, message: 'Usuario o contraseña incorrectos.' });
    for (const code of ['staff_inactive', 'forbidden', 'pc_unavailable'] as const) {
      expect(technicalReply(failure(code, 'Cierra antes la sesión del cliente'), REQUEST)).toEqual({
        ok: false,
        message: 'Cierra antes la sesión del cliente.',
      });
    }
  });

  it('el bloqueo dice a qué hora (de Caracas) se puede volver a intentar', () => {
    expect(
      technicalReply(
        failure('technical_login_locked', 'x', { lockedUntil: '2026-10-22T20:05:00.000Z' }),
        REQUEST,
      ),
    ).toEqual({ ok: false, message: 'Demasiados intentos. Prueba de nuevo a las 16:05.' });
    expect(technicalReply(failure('technical_login_locked'), REQUEST)).toEqual({
      ok: false,
      message: 'Demasiados intentos. Prueba de nuevo en 1 min.',
    });
  });

  it('una PC que no puede preparar el mantenimiento, o un error raro, tienen su texto', () => {
    expect(technicalReply(failure('maintenance_unavailable'), REQUEST)).toEqual({
      ok: false,
      message: 'No se pudo preparar el mantenimiento en esta PC.',
    });
    for (const code of ['unknown_maintenance', 'invalid_exit', 'internal_error'] as const) {
      expect(technicalReply(failure(code), REQUEST)).toEqual({
        ok: false,
        message: TECHNICAL_UNEXPECTED_MESSAGE,
      });
    }
  });
});
