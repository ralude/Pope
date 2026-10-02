import { describe, expect, it } from 'vitest';

import { formatDuration, formatMoney, type SessionState, seconds, usd } from '@pope/shared';

import { liveSession } from './live.js';

const SESSION_ID = '01900000-0000-7000-8000-0000000000aa';

function account(money: number, comboSeconds: number, ratePerHour: number): SessionState {
  const rate = usd(ratePerHour);
  const moneyMicros = usd(money);
  const moneySeconds = seconds(Math.floor((moneyMicros * 3600) / rate));
  return {
    kind: 'account',
    sessionId: SESSION_ID,
    startedAt: '2026-10-01T22:00:00.000Z',
    username: 'juan',
    ratePerHour: { micros: rate, currency: 'USD' },
    comboSeconds: seconds(comboSeconds),
    money: { micros: moneyMicros, currency: 'USD' },
    moneySeconds,
    remainingSeconds: seconds(comboSeconds + moneySeconds),
  };
}

function shown(session: SessionState, elapsed: number) {
  const live = liveSession(session, elapsed);
  if (live.kind !== 'account') throw new Error('Se esperaba una sesión con cuenta');
  return {
    total: formatDuration(live.remainingSeconds),
    combo: formatDuration(live.comboSeconds),
    money: formatMoney(live.moneyMicros),
    moneyTime: formatDuration(live.moneySeconds),
    consuming: live.consuming,
  };
}

describe('liveSession (T47)', () => {
  it('CA-001-12: 3,00 USD a 1,50 USD/h son 2:00:00 y, tras 30 min, 2,25 USD = 1:30:00', () => {
    const session = account(3, 0, 1.5);
    expect(shown(session, 0)).toMatchObject({ total: '2:00:00', money: '3,00 USD' });
    expect(shown(session, 1800)).toMatchObject({
      total: '1:30:00',
      money: '2,25 USD',
      moneyTime: '1:30:00',
      consuming: 'money',
    });
  });

  it('CA-001-16: gasta primero el combo y después el saldo, sin cortes', () => {
    const session = account(3, 1800, 2);
    expect(shown(session, 0)).toEqual({
      total: '2:00:00',
      combo: '0:30:00',
      money: '3,00 USD',
      moneyTime: '1:30:00',
      consuming: 'combo',
    });
    expect(shown(session, 1800)).toMatchObject({
      combo: '0:00:00',
      money: '3,00 USD',
      consuming: 'money',
    });
    expect(shown(session, 2400)).toMatchObject({ total: '1:20:00', money: '2,67 USD' });
  });

  it('no baja de cero', () => {
    expect(shown(account(0.1, 0, 2), 10_000)).toMatchObject({
      total: '0:00:00',
      money: '0,00 USD',
      consuming: null,
    });
  });

  it('en una sesión temporal solo descuenta el restante', () => {
    const temporary: SessionState = {
      kind: 'temporary',
      sessionId: SESSION_ID,
      startedAt: '2026-10-01T22:00:00.000Z',
      name: 'Carlos',
      purchasedSeconds: seconds(1500),
      remainingSeconds: seconds(1500),
    };
    expect(liveSession(temporary, 65.9)).toEqual({
      kind: 'temporary',
      remainingSeconds: 1435,
    });
    expect(liveSession(temporary, 99_999).remainingSeconds).toBe(0);
  });
});
