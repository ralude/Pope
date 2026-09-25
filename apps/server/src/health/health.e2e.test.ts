import 'reflect-metadata';

import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import type { AppConfig } from '../config.js';
import { createTestDatabase } from '../testing/database.js';

async function createApp(mode: AppConfig['mode']): Promise<NestFastifyApplication> {
  const config: AppConfig = { mode, port: 0, host: '127.0.0.1', databaseUrl: 'postgres://test' };
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(config, await createTestDatabase())],
  }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('GET /health (e2e)', () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('responde ok con el modo local', async () => {
    app = await createApp('local');
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', mode: 'local' });
  });

  it('responde ok con el modo nube', async () => {
    app = await createApp('cloud');
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.json()).toEqual({ status: 'ok', mode: 'cloud' });
  });
});
