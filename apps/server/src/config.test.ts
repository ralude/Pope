import { describe, expect, it } from 'vitest';

import { loadConfig } from './config.js';

describe('loadConfig (ADR-0003)', () => {
  it('lee el modo y aplica los valores por defecto', () => {
    expect(loadConfig({ POPE_MODE: 'local' })).toEqual({
      mode: 'local',
      port: 3000,
      host: '0.0.0.0',
    });
  });

  it('lee el puerto y la interfaz', () => {
    expect(loadConfig({ POPE_MODE: 'cloud', PORT: '8080', HOST: '127.0.0.1' })).toEqual({
      mode: 'cloud',
      port: 8080,
      host: '127.0.0.1',
    });
  });

  it('exige POPE_MODE y dice qué variable falla', () => {
    expect(() => loadConfig({})).toThrow(/POPE_MODE/);
    expect(() => loadConfig({ POPE_MODE: 'produccion' })).toThrow(/POPE_MODE/);
  });

  it('rechaza un puerto no válido', () => {
    expect(() => loadConfig({ POPE_MODE: 'local', PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ POPE_MODE: 'local', PORT: '70000' })).toThrow(/PORT/);
  });
});
