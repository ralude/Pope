import { describe, expect, it } from 'vitest';

import {
  type AccountBalances,
  affordableSeconds,
  applyCheckpoint,
  chargeFor,
  type SessionUsage,
  startUsage,
} from './billing.js';
import { formatMoney, type Micros, micros, usd } from './money.js';
import { formatDuration, hours, minutes, type Seconds, seconds } from './time.js';

const MONDAY_RATE = usd(1.5);
const THURSDAY_RATE = usd(2);

function balances(money: Micros, combo: Seconds = seconds(0)): AccountBalances {
  return { moneyMicros: money, comboSeconds: combo };
}

/** Aplica varios checkpoints seguidos con los mismos saldos de cuenta. */
function run(usage: SessionUsage, account: AccountBalances, steps: readonly number[]) {
  let result = { usage, live: account };
  for (const step of steps) {
    result = applyCheckpoint(result.usage, account, seconds(step));
  }
  return result;
}

describe('cobro por segundo (REQ-001-23, ADR-0015)', () => {
  it('10 min 20 s a 1,50 USD/h cobran 0,258333 USD', () => {
    expect(chargeFor(seconds(620), MONDAY_RATE)).toBe(258_333);
    const { usage } = applyCheckpoint(startUsage(MONDAY_RATE), balances(usd(3)), seconds(620));
    expect(usage.moneySeconds).toBe(620);
    expect(usage.moneyChargedMicros).toBe(258_333);
  });

  it('CA-001-12: 3,00 USD un lunes, tras 30 min quedan 2,25 USD = 1:30:00', () => {
    const account = balances(usd(3));
    const { usage, live } = applyCheckpoint(startUsage(MONDAY_RATE), account, minutes(30));
    expect(formatMoney(live.moneyMicros)).toBe('2,25 USD');
    const remaining = affordableSeconds(live.moneyMicros, usage.rateMicrosPerHour);
    expect(formatDuration(remaining)).toBe('1:30:00');
  });

  it('CA-001-13: 3,00 USD un jueves (2,00 USD/h) equivalen a 1:30:00', () => {
    expect(formatDuration(affordableSeconds(usd(3), THURSDAY_RATE))).toBe('1:30:00');
  });

  it('CA-001-01: 3,00 USD un lunes (1,50 USD/h) equivalen a 2:00:00', () => {
    expect(formatDuration(affordableSeconds(usd(3), MONDAY_RATE))).toBe('2:00:00');
  });

  it('un tiempo transcurrido negativo cuenta como 0', () => {
    const start = startUsage(MONDAY_RATE);
    const { usage, live } = applyCheckpoint(start, balances(usd(3)), seconds(-30));
    expect(usage).toEqual(start);
    expect(live.moneyMicros).toBe(usd(3));
  });

  it('rechaza una tarifa no positiva', () => {
    expect(() => startUsage(micros(0))).toThrow(RangeError);
  });
});

describe('combo antes que dinero (REQ-001-87, ADR-0014)', () => {
  it('gasta primero las horas de combo sin tocar el saldo', () => {
    const account = balances(usd(3), minutes(30));
    const { usage, live } = applyCheckpoint(startUsage(THURSDAY_RATE), account, minutes(20));
    expect(usage.comboSecondsUsed).toBe(minutes(20));
    expect(usage.moneySeconds).toBe(0);
    expect(live).toEqual(balances(usd(3), minutes(10)));
  });

  it('pasa de combo a dinero dentro de un mismo checkpoint', () => {
    // 30 min de combo y un checkpoint de 40 min: 30 de combo y 10 de dinero a 2,00 USD/h.
    const account = balances(usd(3), minutes(30));
    const { usage, live } = applyCheckpoint(startUsage(THURSDAY_RATE), account, minutes(40));
    expect(usage.comboSecondsUsed).toBe(minutes(30));
    expect(usage.moneySeconds).toBe(minutes(10));
    expect(live.comboSeconds).toBe(0);
    expect(formatMoney(live.moneyMicros)).toBe('2,67 USD'); // 3,00 − 0,333333
  });

  it('CA-001-16: a los 30 min empieza a gastar saldo sin cortes', () => {
    const account = balances(usd(3), minutes(30));
    const at30 = applyCheckpoint(startUsage(THURSDAY_RATE), account, minutes(30));
    expect(at30.live).toEqual(balances(usd(3), seconds(0)));
    const at31 = applyCheckpoint(at30.usage, account, minutes(1));
    expect(at31.usage.moneySeconds).toBe(60);
    expect(at31.live.moneyMicros).toBe(usd(3) - chargeFor(seconds(60), THURSDAY_RATE));
  });

  it('las horas de combo no dependen de la tarifa (REQ-001-86)', () => {
    const account = balances(usd(0), hours(20));
    const monday = applyCheckpoint(startUsage(MONDAY_RATE), account, hours(2));
    const thursday = applyCheckpoint(startUsage(THURSDAY_RATE), account, hours(2));
    expect(monday.live.comboSeconds).toBe(hours(18));
    expect(thursday.live.comboSeconds).toBe(hours(18));
  });
});

describe('tope en el saldo: nunca queda negativo (REQ-001-25, solo prepago)', () => {
  it('un latido tardío no cobra más de lo que había', () => {
    // 3,60 USD/h = 1 000 µUSD/s: quedan 5 s de saldo y el latido llega 10 s después.
    const rate = usd(3.6);
    const { usage, live } = applyCheckpoint(startUsage(rate), balances(micros(5000)), seconds(10));
    expect(usage.moneySeconds).toBe(5);
    expect(usage.moneyChargedMicros).toBe(5000);
    expect(live.moneyMicros).toBe(0);
  });

  it('el tope coincide con el tiempo restante que ve el cliente (REQ-001-11)', () => {
    // 2 083 µUSD a 1,50 USD/h son 4,9992 s: el Shell muestra 0:00:04 y se cobran 4 s,
    // aunque 5 s costarían floor(2 083,33) = 2 083 µUSD.
    const money = micros(2083);
    expect(affordableSeconds(money, MONDAY_RATE)).toBe(4);
    const { usage } = applyCheckpoint(startUsage(MONDAY_RATE), balances(money), seconds(10));
    expect(usage.moneySeconds).toBe(4);
  });

  it('con combo y dinero agotados no se cobra nada más', () => {
    const account = balances(usd(0.01), minutes(1));
    const end = run(startUsage(MONDAY_RATE), account, [60, 24, 3600, 10]);
    expect(end.usage.comboSecondsUsed).toBe(60);
    expect(end.usage.moneySeconds).toBe(affordableSeconds(usd(0.01), MONDAY_RATE)); // 24 s
    expect(end.live.comboSeconds).toBe(0);
    expect(end.live.moneyMicros).toBeGreaterThanOrEqual(0);
  });

  it('el saldo que sobra tras agotarse es menor que un segundo de uso', () => {
    const end = run(startUsage(MONDAY_RATE), balances(micros(1_000_123)), [10_000]);
    expect(end.live.moneyMicros).toBeGreaterThanOrEqual(0);
    expect(end.live.moneyMicros).toBeLessThan(MONDAY_RATE / 3600);
  });

  it('los contadores no bajan si el saldo de la cuenta baja durante la sesión', () => {
    const first = applyCheckpoint(startUsage(MONDAY_RATE), balances(usd(3)), minutes(30));
    // Compró un combo con saldo: la caché baja hasta justo lo ya consumido.
    const after = balances(first.usage.moneyChargedMicros, hours(20));
    const second = applyCheckpoint(first.usage, after, minutes(1));
    expect(second.usage.moneySeconds).toBe(first.usage.moneySeconds);
    expect(second.usage.comboSecondsUsed).toBe(60);
  });
});

describe('sin deriva: N checkpoints equivalen a uno solo (ADR-0015)', () => {
  // Generador pseudoaleatorio con semilla (mulberry32) para que el test sea reproducible.
  function random(seed: number): () => number {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
  }

  it('sumar checkpoints parciales da lo mismo que uno total', () => {
    const next = random(20260925);
    for (let i = 0; i < 500; i++) {
      const rate = micros(1 + Math.floor(next() * 5_000_000));
      const account = balances(
        micros(Math.floor(next() * 50_000_000)),
        seconds(Math.floor(next() * 20_000)),
      );
      const steps = Array.from({ length: 1 + Math.floor(next() * 400) }, () =>
        Math.floor(next() * 30),
      );
      const total = steps.reduce((sum, step) => sum + step, 0);

      const split = run(startUsage(rate), account, steps);
      const whole = run(startUsage(rate), account, [total]);
      expect(split).toEqual(whole);
      expect(split.live.moneyMicros).toBeGreaterThanOrEqual(0);
      expect(split.live.comboSeconds).toBeGreaterThanOrEqual(0);
    }
  });

  it('una sesión de 8 h en latidos de 10 s cobra exactamente 8 h', () => {
    const steps = Array.from({ length: (8 * 3600) / 10 }, () => 10);
    const end = run(startUsage(MONDAY_RATE), balances(usd(100)), steps);
    expect(end.usage.moneyChargedMicros).toBe(usd(12));
  });
});

describe('importes grandes', () => {
  it('no desborda en el producto intermedio', () => {
    // 1 000 000 USD a 1,50 USD/h: el producto intermedio (3,6·10¹⁵) roza el entero seguro.
    expect(affordableSeconds(usd(1_000_000), MONDAY_RATE)).toBe(2_400_000_000);
    expect(chargeFor(seconds(2_400_000_000), MONDAY_RATE)).toBe(usd(1_000_000));
  });

  it('rechaza un resultado que no cabe en un entero seguro', () => {
    expect(() => affordableSeconds(micros(Number.MAX_SAFE_INTEGER), micros(1))).toThrow(RangeError);
  });
});
