import 'reflect-metadata';

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type Type } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';

import { AppModule } from '../app.module.js';
import { Clock } from '../common/clock.js';
import { configureApp } from '../bootstrap.js';
import type { AppConfig } from '../config.js';
import type { DatabaseHandle } from '../db/database.js';
import { createTestDatabase } from './database.js';

export interface TestApp {
  app: NestFastifyApplication;
  database: DatabaseHandle;
  /** Carpeta de datos del nodo, temporal: se borra al cerrar. */
  dataDir: string;
  close(): Promise<void>;
}

export interface TestAppOptions {
  /** Reloj del nodo; p. ej. un `FakeClock` para fijar el día de la semana. */
  clock?: Clock;
  /** Carpeta de un panel compilado de prueba, para servirlo (T45a). */
  panelDir?: string;
}

/**
 * Levanta el servidor completo sobre una base de datos de test, como en `main.ts`. Admite
 * controladores extra solo para el test (p. ej. para probar el guard de roles).
 */
export async function createTestApp(
  mode: AppConfig['mode'] = 'local',
  extraControllers: Type[] = [],
  options: TestAppOptions = {},
): Promise<TestApp> {
  const database = await createTestDatabase();
  const dataDir = await mkdtemp(join(tmpdir(), 'pope-test-'));
  const config: AppConfig = {
    mode,
    port: 0,
    host: '127.0.0.1',
    databaseUrl: 'postgres://test',
    memoryLogMs: null,
    dataDir,
  };
  const builder = Test.createTestingModule({
    imports: [AppModule.register(config, database)],
    controllers: extraControllers,
  });
  if (options.clock) {
    builder.overrideProvider(Clock).useValue(options.clock);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await configureApp(app, { panelDir: options.panelDir ?? null });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return {
    app,
    database,
    dataDir,
    // Al cerrar la aplicación se cierra también la base de datos (DatabaseModule).
    close: async () => {
      await app.close();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}
