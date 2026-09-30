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
      memoryLogMs: null,
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
      memoryLogMs: null,
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

  it('el registro de memoria es opcional, de 1000 ms como mínimo (ADR-0011)', () => {
    const base = { POPE_MODE: 'local', DATABASE_URL };
    expect(loadConfig(base).memoryLogMs).toBeNull();
    expect(loadConfig({ ...base, POPE_MEMORY_LOG_MS: '5000' }).memoryLogMs).toBe(5000);
    expect(loadConfig({ ...base, POPE_MEMORY_LOG_MS: '1000' }).memoryLogMs).toBe(1000);
    for (const bad of ['999', '0', 'abc', '1500.5', '']) {
      expect(() => loadConfig({ ...base, POPE_MEMORY_LOG_MS: bad })).toThrow(/POPE_MEMORY_LOG_MS/);
    }
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
