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
    });
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
