import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../config.js';
import { FakeClock } from '../testing/clock.js';
import { MemoryLogService, memoryLine } from './memory-log.service.js';

const config = (memoryLogMs: number | null): AppConfig => ({
  mode: 'local',
  port: 0,
  host: '127.0.0.1',
  databaseUrl: 'postgres://test',
  memoryLogMs,
});

describe('registro de memoria (ADR-0011)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('da la memoria en MB con un decimal', () => {
    expect(memoryLine({ rss: 150 * 1024 * 1024 + 52_429, heapUsed: 40 * 1024 * 1024 })).toBe(
      'Memoria: rss=150.1 MB heapUsed=40.0 MB',
    );
  });

  it('registra una línea por intervalo y se detiene al cerrar', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const clock = new FakeClock();
    const service = new MemoryLogService(config(5000), clock);

    service.onApplicationBootstrap();
    await clock.tick(4999);
    expect(log).not.toHaveBeenCalled();
    await clock.tick(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toMatch(/^Memoria: rss=\d+\.\d MB heapUsed=\d+\.\d MB$/);
    await clock.tick(10_000);
    expect(log).toHaveBeenCalledTimes(3);

    service.onModuleDestroy();
    await clock.tick(60_000);
    expect(log).toHaveBeenCalledTimes(3);
  });

  it('sin la variable no registra nada ni programa nada', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const clock = new FakeClock();
    new MemoryLogService(config(null), clock).onApplicationBootstrap();
    await clock.tick(3_600_000);
    expect(log).not.toHaveBeenCalled();
  });
});
