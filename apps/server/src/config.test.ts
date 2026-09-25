import { describe, expect, it } from 'vitest';

import { loadConfig } from './config.js';

const DATABASE_URL = 'postgres://pope:clave@127.0.0.1:5432/pope';

describe('loadConfig (ADR-0003)', () => {
  it('lee el modo y aplica los valores por defecto', () => {
    expect(loadConfig({ POPE_MODE: 'local', DATABASE_URL })).toEqual({
      mode: 'local',
      port: 3000,
      host: '0.0.0.0',
      databaseUrl: DATABASE_URL,
    });
  });

  it('lee el puerto y la interfaz', () => {
    expect(
      loadConfig({ POPE_MODE: 'cloud', PORT: '8080', HOST: '127.0.0.1', DATABASE_URL }),
    ).toEqual({
      mode: 'cloud',
      port: 8080,
      host: '127.0.0.1',
      databaseUrl: DATABASE_URL,
    });
  });

  it('exige POPE_MODE y dice qué variable falla', () => {
    expect(() => loadConfig({ DATABASE_URL })).toThrow(/POPE_MODE/);
    expect(() => loadConfig({ POPE_MODE: 'produccion', DATABASE_URL })).toThrow(/POPE_MODE/);
  });

  it('rechaza un puerto no válido', () => {
    expect(() => loadConfig({ POPE_MODE: 'local', DATABASE_URL, PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ POPE_MODE: 'local', DATABASE_URL, PORT: '70000' })).toThrow(/PORT/);
  });

  it('exige una DATABASE_URL de PostgreSQL', () => {
    expect(() => loadConfig({ POPE_MODE: 'local' })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ POPE_MODE: 'local', DATABASE_URL: 'mysql://x@y/z' })).toThrow(
      /DATABASE_URL/,
    );
    expect(loadConfig({ POPE_MODE: 'local', DATABASE_URL: 'postgresql://x@y/z' }).databaseUrl).toBe(
      'postgresql://x@y/z',
    );
  });
});
