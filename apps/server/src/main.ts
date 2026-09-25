// Punto de entrada del servidor de Pope.
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';
import { loadConfig } from './config.js';

const config = loadConfig(process.env);
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule.register(config),
  new FastifyAdapter(),
);
app.enableShutdownHooks();
await app.listen(config.port, config.host);
