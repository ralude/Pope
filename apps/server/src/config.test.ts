import { describe, expect, it } from 'vitest';

import { resolve } from 'node:path';

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
      tls: null,
      wakeOnLan: { address: '255.255.255.255', port: 9 },
      dataDir: resolve(import.meta.dirname, '..', 'data'),
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
      tls: null,
      wakeOnLan: { address: '255.255.255.255', port: 9 },
      dataDir: resolve(import.meta.dirname, '..', 'data'),
    });
  });

  it('lee el destino de Wake-on-LAN y rechaza lo que no es una IPv4 o un puerto', () => {
    const wake = (env: Record<string, string>) =>
      loadConfig({ POPE_MODE: 'local', DATABASE_URL, ...env }).wakeOnLan;
    expect(wake({})).toEqual({ address: '255.255.255.255', port: 9 });
    expect(wake({ POPE_WOL_ADDRESS: '192.168.1.255', POPE_WOL_PORT: '7' })).toEqual({
      address: '192.168.1.255',
      port: 7,
    });
    expect(() => wake({ POPE_WOL_ADDRESS: 'lan' })).toThrow(/POPE_WOL_ADDRESS/);
    expect(() => wake({ POPE_WOL_PORT: '70000' })).toThrow(/POPE_WOL_PORT/);
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

  it('la carpeta de datos es data/ junto al servidor, o la de POPE_DATA_DIR (REQ-005-03)', () => {
    expect(loadConfig({ POPE_MODE: 'local', DATABASE_URL }).dataDir).toBe(
      resolve(import.meta.dirname, '..', 'data'),
    );
    expect(
      loadConfig({ POPE_MODE: 'local', DATABASE_URL, POPE_DATA_DIR: 'pope-datos' }).dataDir,
    ).toBe(resolve('pope-datos'));
  });
});
