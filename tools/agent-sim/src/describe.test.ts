import { describe, expect, it } from 'vitest';

import { describeEvent } from './describe.js';

const SID = '01900000-0000-7000-8000-000000000123';

describe('texto de los eventos', () => {
  it('describe una sesión con cuenta con tiempo y saldo, y una temporal con su nombre', () => {
    expect(
      describeEvent({
        kind: 'message',
        message: {
          type: 'state',
          status: 'active',
          vesRate: null,
          session: {
            kind: 'account',
            sessionId: SID,
            startedAt: '2026-09-28T22:00:00.000Z',
            username: 'sim05',
            ratePerHour: { micros: 1_500_000, currency: 'USD' },
            comboSeconds: 0,
            money: { micros: 3_000_000, currency: 'USD' },
            moneySeconds: 7200,
            remainingSeconds: 7200,
          },
        } as never,
      }),
    ).toBe('sim05 · 2:00:00 · 3,00 USD');
    expect(
      describeEvent({
        kind: 'message',
        message: {
          type: 'state',
          status: 'active',
          vesRate: null,
          session: {
            kind: 'temporary',
            sessionId: SID,
            startedAt: '2026-09-28T22:00:00.000Z',
            name: 'Carlos',
            purchasedSeconds: 3600,
            remainingSeconds: 3600,
          },
        } as never,
      }),
    ).toBe('sesión temporal «Carlos» · 1:00:00');
  });

  it('describe bloqueo, avisos, fin de sesión, errores y conexión', () => {
    const message = (m: object) => describeEvent({ kind: 'message', message: m as never });
    expect(message({ type: 'state', status: 'locked' })).toBe('bloqueada');
    expect(message({ type: 'warning', sessionId: SID, minutesLeft: 5 })).toBe('aviso: queda 5 min');
    expect(message({ type: 'sessionEnded', sessionId: SID, reason: 'no_heartbeat' })).toBe(
      'sesión terminada (sin latidos)',
    );
    expect(message({ type: 'error', code: 'insufficient_balance', message: 'Sin saldo' })).toBe(
      'error insufficient_balance: Sin saldo',
    );
    expect(describeEvent({ kind: 'connected' })).toBe('conectada');
    expect(describeEvent({ kind: 'disconnected' })).toBe('desconectada');
    expect(describeEvent({ kind: 'invalid', reason: 'x' })).toContain('mensaje no válido');
  });
});
