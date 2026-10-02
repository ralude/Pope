import { describe, expect, it } from 'vitest';

import { UNEXPECTED_MESSAGE } from '../lock/login.js';
import { logoutReply } from './logout.js';

const SESSION = '01900000-0000-7000-8000-0000000000aa';

describe('logoutReply (T50)', () => {
  it('la sesión cerrada, o la PC ya bloqueada, es un cierre correcto', () => {
    expect(
      logoutReply({ type: 'sessionEnded', sessionId: SESSION, reason: 'customer' }, 'l1'),
    ).toEqual({ ok: true });
    expect(logoutReply({ type: 'state', status: 'locked' }, 'l1')).toEqual({ ok: true });
  });

  it('los errores de esa petición se muestran; los demás mensajes no responden', () => {
    expect(
      logoutReply({ type: 'error', code: 'internal_error', message: 'x', requestId: 'l1' }, 'l1'),
    ).toEqual({ ok: false, message: UNEXPECTED_MESSAGE });
    expect(logoutReply({ type: 'warning', sessionId: SESSION, minutesLeft: 5 }, 'l1')).toBeNull();
    expect(
      logoutReply({ type: 'error', code: 'internal_error', message: 'x', requestId: 'otro' }, 'l1'),
    ).toBeNull();
  });
});
