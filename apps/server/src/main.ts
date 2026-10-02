// Punto de entrada del servidor de Pope.
import 'reflect-metadata';

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';
import { loadConfig } from './config.js';
import { openPostgresDatabase } from './db/postgres.js';

const config = loadConfig(process.env);
// Aplica las migraciones pendientes antes de aceptar conexiones.
const database = await openPostgresDatabase(config.databaseUrl);
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule.register(config, database),
  new FastifyAdapter(),
);
// El nodo local sirve el panel compilado (T45a): `apps/panel/dist`, junto a este paquete.
let panelDir: string | null = null;
if (config.mode === 'local') {
  const dir = fileURLToPath(new URL('../../panel/dist', import.meta.url));
  if (existsSync(dir)) {
    panelDir = dir;
  } else {
    new Logger('Panel').warn(`No se sirve el panel: falta ${dir} (compílalo con pnpm build).`);
  }
}
await configureApp(app, { panelDir });
app.enableShutdownHooks();
await app.listen(config.port, config.host);
