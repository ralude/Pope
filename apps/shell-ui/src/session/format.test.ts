import { describe, expect, it } from 'vitest';

import { formatTimeLeft, warningMinutes } from './format.js';

describe('warningMinutes (T48)', () => {
  it('dice los minutos del aviso del nodo', () => {
    expect(warningMinutes(5, 300)).toBe(5);
    expect(warningMinutes(1, 60)).toBe(1);
  });

  it('nunca más de los que quedan: el nodo reenvía el de 5 tras reiniciarse', () => {
    expect(warningMinutes(5, 170)).toBe(3);
    expect(warningMinutes(5, 20)).toBe(1);
    expect(warningMinutes(1, 61)).toBe(1);
  });
});

describe('formatTimeLeft', () => {
  it('muestra horas y minutos, sin segundos', () => {
    expect(formatTimeLeft(4 * 3600 + 15 * 60)).toBe('4 h 15 min');
    expect(formatTimeLeft(45 * 60)).toBe('45 min');
    expect(formatTimeLeft(2 * 3600)).toBe('2 h');
    expect(formatTimeLeft(20 * 3600 + 30 * 60)).toBe('20 h 30 min');
  });

  it('redondea hacia arriba: con tiempo nunca se ve «0 min»', () => {
    expect(formatTimeLeft(59)).toBe('1 min');
    expect(formatTimeLeft(4 * 3600 + 14 * 60 + 1)).toBe('4 h 15 min');
    expect(formatTimeLeft(3599)).toBe('1 h');
    expect(formatTimeLeft(0)).toBe('0 min');
  });
});
