import { describe, expect, it } from 'vitest';

import { type AccountBalances, applyCheckpoint, startUsage } from './billing.js';
import {
  applyTemporaryCheckpoint,
  pendingWarnings,
  secondsUntilAttention,
  secondsUntilExhausted,
  type TemporaryUsage,
  temporaryRemaining,
  type WarningMinutes,
} from './exhaustion.js';
import { usd } from './money.js';
import { formatDuration, hours, minutes, seconds } from './time.js';

const THURSDAY_RATE = usd(2);

describe('secondsUntilExhausted (REQ-001-25, REQ-001-88)', () => {
  it('solo dinero: el saldo ÷ la tarifa', () => {
    const account: AccountBalances = { moneyMicros: usd(3), comboSeconds: seconds(0) };
    const start = startUsage(THURSDAY_RATE);
    expect(formatDuration(secondsUntilExhausted(start, account))).toBe('1:30:00');

    const later = applyCheckpoint(start, account, minutes(30));
    expect(formatDuration(secondsUntilExhausted(later.usage, account))).toBe('1:00:00');
  });

  it('CA-001-16: combo 0:30:00 y 3,00 USD un jueves dan 2:00:00 en total', () => {
    const account: AccountBalances = { moneyMicros: usd(3), comboSeconds: minutes(30) };
    const start = startUsage(THURSDAY_RATE);
    expect(formatDuration(secondsUntilExhausted(start, account))).toBe('2:00:00');

    // A los 45 min ya no queda combo y se lleva 15 min de dinero.
    const later = applyCheckpoint(start, account, minutes(45));
    expect(formatDuration(secondsUntilExhausted(later.usage, account))).toBe('1:15:00');
  });

  it('llega a 0 exactamente cuando el cobro alcanza el tope', () => {
    const account: AccountBalances = { moneyMicros: usd(0.1), comboSeconds: minutes(1) };
    const start = startUsage(THURSDAY_RATE);
    const total = secondsUntilExhausted(start, account);

    const almost = applyCheckpoint(start, account, seconds(total - 1));
    expect(secondsUntilExhausted(almost.usage, account)).toBe(1);

    const done = applyCheckpoint(almost.usage, account, seconds(1));
    expect(secondsUntilExhausted(done.usage, account)).toBe(0);

    // Un latido tardío ya no cobra nada más.
    const late = applyCheckpoint(done.usage, account, seconds(30));
    expect(late.usage).toEqual(done.usage);
  });

  it('nunca es negativo aunque el saldo baje durante la sesión', () => {
    const account: AccountBalances = { moneyMicros: usd(3), comboSeconds: seconds(0) };
    const later = applyCheckpoint(startUsage(THURSDAY_RATE), account, minutes(30));
    const afterPurchase: AccountBalances = { moneyMicros: usd(0.5), comboSeconds: seconds(0) };
    expect(secondsUntilExhausted(later.usage, afterPurchase)).toBe(0);
  });
});

describe('sesiones temporales (REQ-001-62, REQ-001-63)', () => {
  const oneHour: TemporaryUsage = { purchasedSeconds: hours(1), usedSeconds: seconds(0) };

  it('descuenta el tiempo usado del comprado', () => {
    const after = applyTemporaryCheckpoint(oneHour, minutes(20));
    expect(formatDuration(temporaryRemaining(after))).toBe('0:40:00');
  });

  it('nunca usa más de lo comprado y se agota en 0', () => {
    const after = applyTemporaryCheckpoint(oneHour, hours(2));
    expect(after.usedSeconds).toBe(hours(1));
    expect(temporaryRemaining(after)).toBe(0);
  });

  it('un tiempo negativo cuenta como 0', () => {
    expect(applyTemporaryCheckpoint(oneHour, seconds(-5))).toEqual(oneHour);
  });

  it('añadir tiempo alarga la sesión (REQ-001-70)', () => {
    // CA-001-10: con 10 min restantes se cobran 0,75 USD a 1,50 USD/h = 30 min más.
    const used = applyTemporaryCheckpoint(oneHour, minutes(50));
    const topped: TemporaryUsage = { ...used, purchasedSeconds: seconds(hours(1) + minutes(30)) };
    expect(formatDuration(temporaryRemaining(topped))).toBe('0:40:00');
  });
});

describe('pendingWarnings (REQ-001-24)', () => {
  /** Simula la cuenta atrás y devuelve los avisos enviados en cada instante. */
  function simulate(remainings: readonly number[], initial: readonly WarningMinutes[] = []) {
    let sent = [...initial];
    const sends: (WarningMinutes | null)[] = [];
    for (const remaining of remainings) {
      const check = pendingWarnings(seconds(remaining), sent);
      sends.push(check.send);
      sent = check.sent;
    }
    return { sends, sent };
  }

  it('avisa al cruzar los 5 min y el 1 min, una sola vez cada uno', () => {
    const { sends } = simulate([600, 301, 300, 290, 61, 60, 50, 0]);
    expect(sends).toEqual([null, null, 5, null, null, 1, null, null]);
  });

  it('si la sesión empieza con 3 min, avisa de los 5 min al empezar', () => {
    const { sends } = simulate([180, 170, 60]);
    expect(sends).toEqual([5, null, 1]);
  });

  it('si empieza con menos de 1 min, solo envía el aviso más urgente', () => {
    const { sends, sent } = simulate([45, 40]);
    expect(sends).toEqual([1, null]);
    expect(sent).toEqual([5, 1]);
  });

  it('se rearma si compra tiempo y vuelve a superar el umbral', () => {
    // Recibe los dos avisos, compra 1 h y vuelve a cruzar los 5 min y el 1 min.
    const { sends } = simulate([300, 60, 3660, 300, 60]);
    expect(sends).toEqual([5, 1, null, 5, 1]);
  });

  it('si compra poco tiempo, solo se rearman los umbrales superados', () => {
    // Con 2 min tras la compra, el aviso de 5 min ya se envió y no se repite.
    const { sends } = simulate([300, 60, 120, 60]);
    expect(sends).toEqual([5, 1, null, 1]);
  });
});

describe('secondsUntilAttention (REQ-001-24, REQ-001-25)', () => {
  const until = (remaining: number) => secondsUntilAttention(seconds(remaining));

  it('espera hasta que queden 5 min, luego hasta 1 min y luego hasta el agotamiento', () => {
    expect(until(7200)).toBe(6900);
    expect(until(301)).toBe(1);
    expect(until(300)).toBe(240);
    expect(until(61)).toBe(1);
    expect(until(60)).toBe(60);
    expect(until(1)).toBe(1);
  });

  it('no espera nada si ya se agotó', () => {
    expect(until(0)).toBe(0);
    expect(until(-5)).toBe(0);
  });
});
