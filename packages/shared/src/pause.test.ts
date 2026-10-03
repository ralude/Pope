import { describe, expect, it } from 'vitest';

import {
  PAUSE_REFUSAL_MESSAGES,
  pauseAllowance,
  pauseExpired,
  pauseMaxUntil,
  pauseRefusal,
  pauseSecondsLeft,
  type PauseSettings,
  pausesOnDayOf,
} from './pause.js';
import { DEFAULT_SETTINGS } from './settings.js';

const settings: PauseSettings = DEFAULT_SETTINGS;

describe('pausas que quedan (REQ-002-21, REQ-002-23, REQ-002-24)', () => {
  it('sin pausas usadas quedan 3, las de la sesión', () => {
    expect(pauseAllowance(settings, { inSession: 0, today: 0 })).toEqual({ left: 3, limit: null });
  });

  it('quedan las menos entre las de la sesión y las del día', () => {
    expect(pauseAllowance(settings, { inSession: 1, today: 1 })).toEqual({ left: 2, limit: null });
    expect(pauseAllowance(settings, { inSession: 0, today: 4 })).toEqual({ left: 1, limit: null });
  });

  it('CA-002-04: tras 3 pausas en la sesión no quedan, por el límite de la sesión', () => {
    expect(pauseAllowance(settings, { inSession: 3, today: 3 })).toEqual({
      left: 0,
      limit: 'session',
    });
  });

  it('CA-002-06: con 5 pausas hoy en otras sesiones, la nueva no tiene, por el límite del día', () => {
    expect(pauseAllowance(settings, { inSession: 0, today: 5 })).toEqual({ left: 0, limit: 'day' });
  });

  it('si se agotan las dos a la vez, manda el límite del día', () => {
    const tight = { ...settings, pauseMaxPerSession: 3, pauseMaxPerDay: 3 };
    expect(pauseAllowance(tight, { inSession: 3, today: 3 })).toEqual({ left: 0, limit: 'day' });
  });

  it('más usadas que el límite (el administrador lo bajó) no dan un número negativo', () => {
    expect(
      pauseAllowance({ ...settings, pauseMaxPerSession: 1 }, { inSession: 2, today: 2 }),
    ).toEqual({ left: 0, limit: 'session' });
  });

  it('REQ-002-23: con la pausa desactivada no queda ninguna', () => {
    expect(pauseAllowance({ ...settings, pauseEnabled: 0 }, { inSession: 0, today: 0 })).toEqual({
      left: 0,
      limit: 'disabled',
    });
  });
});

describe('por qué no se puede pausar (REQ-002-11)', () => {
  const free = { left: 3, limit: null };

  it('una sesión con cuenta y con pausas puede', () => {
    expect(pauseRefusal({ kind: 'account', paused: false, allowance: free })).toBeNull();
  });

  it('CA-002-07: una temporal nunca, aunque haya pausas en el local', () => {
    expect(pauseRefusal({ kind: 'temporary', paused: false, allowance: free })).toBe('temporary');
  });

  it('una sesión ya en pausa no vuelve a pausar', () => {
    expect(pauseRefusal({ kind: 'account', paused: true, allowance: free })).toBe('already_paused');
  });

  it('sin pausas, el motivo es el límite que se alcanzó', () => {
    expect(
      pauseRefusal({ kind: 'account', paused: false, allowance: { left: 0, limit: 'day' } }),
    ).toBe('day');
    expect(
      pauseRefusal({ kind: 'account', paused: false, allowance: { left: 0, limit: 'disabled' } }),
    ).toBe('disabled');
  });

  it('cada motivo tiene su texto; los de los límites son los de la spec', () => {
    expect(PAUSE_REFUSAL_MESSAGES.session).toBe('Sin pausas disponibles');
    expect(PAUSE_REFUSAL_MESSAGES.day).toBe('Sin pausas disponibles hoy');
    expect(PAUSE_REFUSAL_MESSAGES.disabled).toBe('La pausa no está disponible en este local');
    expect(PAUSE_REFUSAL_MESSAGES.temporary).toBe('Las sesiones temporales no se pueden pausar');
    expect(PAUSE_REFUSAL_MESSAGES.already_paused).toBe('Tu sesión ya está en pausa');
  });
});

describe('duración de la pausa (REQ-002-20, REQ-002-22)', () => {
  const start = new Date('2026-10-03T22:00:00.000Z');

  it('dura 15 min por defecto', () => {
    expect(pauseMaxUntil(start, settings).toISOString()).toBe('2026-10-03T22:15:00.000Z');
    expect(pauseMaxUntil(start, { pauseMaxSeconds: 60 }).toISOString()).toBe(
      '2026-10-03T22:01:00.000Z',
    );
  });

  it('cuenta lo que queda de pausa, redondeando hacia arriba, y nunca menos de 0', () => {
    const until = pauseMaxUntil(start, settings);
    expect(pauseSecondsLeft(until, start)).toBe(900);
    expect(pauseSecondsLeft(until, new Date('2026-10-03T22:03:00.400Z'))).toBe(720);
    expect(pauseSecondsLeft(until, new Date('2026-10-03T22:20:00.000Z'))).toBe(0);
  });

  it('vence justo al llegar a la duración máxima', () => {
    const until = pauseMaxUntil(start, settings);
    expect(pauseExpired(until, new Date('2026-10-03T22:14:59.999Z'))).toBe(false);
    expect(pauseExpired(until, until)).toBe(true);
  });
});

describe('pausas del día en Caracas (REQ-002-24)', () => {
  it('cuenta las pausas del mismo día de Caracas, que cambia a las 04:00 UTC', () => {
    // 23:59 y 00:01 en Caracas (UTC−4) son días distintos.
    const lateYesterday = new Date('2026-10-04T03:59:00.000Z');
    const earlyToday = new Date('2026-10-04T04:01:00.000Z');
    const now = new Date('2026-10-04T15:00:00.000Z');
    expect(pausesOnDayOf([lateYesterday, earlyToday, now], now)).toBe(2);
    expect(pausesOnDayOf([lateYesterday], lateYesterday)).toBe(1);
    expect(pausesOnDayOf([], now)).toBe(0);
  });
});
