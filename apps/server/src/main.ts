// Punto de entrada del servidor de Pope.
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';
import { loadConfig } from './config.js';
import { openPostgresDatabase } from './db/postgres.js';

const config = loadConfig(process.env);
// Aplica las migraciones pendientes antes de aceptar conexiones.
const database = await openPostgresDatabase(config.databaseUrl);
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule.register(config, database),
  new FastifyAdapter(),
);
app.enableShutdownHooks();
await app.listen(config.port, config.host);
