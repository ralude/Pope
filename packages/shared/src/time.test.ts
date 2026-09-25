import { describe, expect, it } from 'vitest';

import { formatDuration, hours, minutes, seconds, secondsSchema } from './time.js';

describe('segundos enteros (ADR-0015)', () => {
  it('convierte minutos y horas a segundos', () => {
    expect(minutes(30)).toBe(1800);
    expect(hours(1.5)).toBe(5400);
    expect(hours(20)).toBe(72_000);
  });

  it('rechaza duraciones no enteras', () => {
    expect(() => seconds(1.5)).toThrow(RangeError);
    expect(() => minutes(0.001)).toThrow(RangeError);
    expect(secondsSchema.safeParse(1.5).success).toBe(false);
    expect(secondsSchema.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(false);
    expect(secondsSchema.safeParse(600).success).toBe(true);
  });
});

describe('formatDuration (REQ-001-12, REQ-001-88)', () => {
  it('muestra H:MM:SS', () => {
    expect(formatDuration(hours(2))).toBe('2:00:00');
    expect(formatDuration(minutes(90))).toBe('1:30:00');
    expect(formatDuration(seconds(620))).toBe('0:10:20');
    expect(formatDuration(seconds(0))).toBe('0:00:00');
    expect(formatDuration(seconds(59))).toBe('0:00:59');
  });

  it('no limita las horas a 24 (horas de combo, CA-001-15)', () => {
    expect(formatDuration(hours(18))).toBe('18:00:00');
    expect(formatDuration(hours(125))).toBe('125:00:00');
  });

  it('rechaza duraciones negativas', () => {
    expect(() => formatDuration(seconds(-1))).toThrow(RangeError);
  });
});
