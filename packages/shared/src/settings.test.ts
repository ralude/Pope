import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SETTINGS,
  settingKeySchema,
  settingsSchema,
  settingsUpdateRequestSchema,
} from './settings.js';

describe('ajustes del nodo (REQ-001-27, REQ-001-64)', () => {
  it('los valores por defecto son 3 min de gracia y 3 sesiones temporales por PC', () => {
    expect(settingsSchema.parse(DEFAULT_SETTINGS)).toEqual({
      heartbeatGraceSeconds: 180,
      temporarySessionsKeptPerPc: 3,
      allowNegativeStock: 0,
      localName: 'Pope',
      pauseEnabled: 1,
      pauseMaxSeconds: 900,
      pauseMaxPerSession: 3,
      pauseMaxPerDay: 5,
      pauseOverrun: 'resume_billing',
    });
  });

  describe('ajustes de la pausa (spec 002)', () => {
    const valid = (body: object) => settingsUpdateRequestSchema.safeParse(body).success;

    it('REQ-002-23: la pausa está activada por defecto y solo vale 0 o 1', () => {
      expect(DEFAULT_SETTINGS.pauseEnabled).toBe(1);
      expect(valid({ pauseEnabled: 0 })).toBe(true);
      expect(valid({ pauseEnabled: 1 })).toBe(true);
      expect(valid({ pauseEnabled: 2 })).toBe(false);
      expect(valid({ pauseEnabled: true })).toBe(false);
    });

    it('REQ-002-20: cada pausa dura 15 min por defecto, de 1 min a 1 h', () => {
      expect(DEFAULT_SETTINGS.pauseMaxSeconds).toBe(900);
      expect(valid({ pauseMaxSeconds: 59 })).toBe(false);
      expect(valid({ pauseMaxSeconds: 60 })).toBe(true);
      expect(valid({ pauseMaxSeconds: 3600 })).toBe(true);
      expect(valid({ pauseMaxSeconds: 3601 })).toBe(false);
      expect(valid({ pauseMaxSeconds: 90.5 })).toBe(false);
    });

    it('REQ-002-21: 3 pausas por sesión por defecto, de 1 a 20', () => {
      expect(DEFAULT_SETTINGS.pauseMaxPerSession).toBe(3);
      expect(valid({ pauseMaxPerSession: 0 })).toBe(false);
      expect(valid({ pauseMaxPerSession: 1 })).toBe(true);
      expect(valid({ pauseMaxPerSession: 20 })).toBe(true);
      expect(valid({ pauseMaxPerSession: 21 })).toBe(false);
    });

    it('REQ-002-24: 5 pausas por día por defecto, de 1 a 50', () => {
      expect(DEFAULT_SETTINGS.pauseMaxPerDay).toBe(5);
      expect(valid({ pauseMaxPerDay: 0 })).toBe(false);
      expect(valid({ pauseMaxPerDay: 1 })).toBe(true);
      expect(valid({ pauseMaxPerDay: 50 })).toBe(true);
      expect(valid({ pauseMaxPerDay: 51 })).toBe(false);
    });

    it('REQ-002-22: al vencer, por defecto se vuelve a cobrar; la otra opción es cerrar', () => {
      expect(DEFAULT_SETTINGS.pauseOverrun).toBe('resume_billing');
      expect(valid({ pauseOverrun: 'close' })).toBe(true);
      expect(valid({ pauseOverrun: 'resume_billing' })).toBe(true);
      // La antigua opción c), la tarifa de reserva, se retiró.
      expect(valid({ pauseOverrun: 'reserve' })).toBe(false);
    });
  });

  it('el nombre del local es un texto de 1 a 60 caracteres (REQ-005-51)', () => {
    const parse = (localName: string) => settingsUpdateRequestSchema.safeParse({ localName });
    expect(parse('  Ciber Ana  ').data).toEqual({ localName: 'Ciber Ana' });
    expect(parse('   ').success).toBe(false);
    expect(parse('x'.repeat(61)).success).toBe(false);
  });

  it('vender sin stock está apagado por defecto y solo vale 0 o 1 (REQ-005-12)', () => {
    const valid = (allowNegativeStock: number) =>
      settingsUpdateRequestSchema.safeParse({ allowNegativeStock }).success;
    expect(valid(0)).toBe(true);
    expect(valid(1)).toBe(true);
    expect(valid(2)).toBe(false);
    expect(valid(-1)).toBe(false);
  });

  it('las sesiones temporales conservadas no bajan de 3', () => {
    const valid = (temporarySessionsKeptPerPc: number) =>
      settingsUpdateRequestSchema.safeParse({ temporarySessionsKeptPerPc }).success;
    expect(valid(2)).toBe(false);
    expect(valid(3)).toBe(true);
    expect(valid(5)).toBe(true);
    expect(valid(3.5)).toBe(false);
  });

  it('el tiempo de gracia está entre 30 s y 30 min', () => {
    const valid = (heartbeatGraceSeconds: number) =>
      settingsUpdateRequestSchema.safeParse({ heartbeatGraceSeconds }).success;
    expect(valid(29)).toBe(false);
    expect(valid(30)).toBe(true);
    expect(valid(1800)).toBe(true);
    expect(valid(1801)).toBe(false);
  });

  it('las claves de los ajustes son las del esquema', () => {
    expect(settingKeySchema.options).toEqual(Object.keys(DEFAULT_SETTINGS));
  });

  it('la actualización pide al menos un ajuste y rechaza los desconocidos', () => {
    expect(settingsUpdateRequestSchema.safeParse({}).success).toBe(false);
    expect(settingsUpdateRequestSchema.safeParse({ colorFavorito: 'azul' }).success).toBe(false);
    expect(settingsUpdateRequestSchema.safeParse({ heartbeatGraceSeconds: 60 }).success).toBe(true);
  });
});
