import { type DynamicModule, Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module.js';
import { Clock, SystemClock } from './common/clock.js';
import { APP_CONFIG, type AppConfig, type PopeMode } from './config.js';
import type { DatabaseHandle } from './db/database.js';
import { DatabaseModule } from './db/database.module.js';
import { EventsModule } from './events/events.module.js';
import { HealthModule } from './health/health.module.js';

/** Módulos que se cargan en los dos modos. */
const COMMON_MODULES = [HealthModule];

/** Módulos propios de cada modo (ADR-0003). Cada spec añade aquí los suyos. */
const MODULES_BY_MODE: Record<PopeMode, DynamicModule['imports']> = {
  local: [EventsModule, AuthModule],
  cloud: [],
};

/**
 * Módulo raíz: carga los módulos comunes y los del modo indicado en `POPE_MODE`. Recibe la
 * base de datos ya abierta y migrada (PostgreSQL en `main.ts`, PGlite en los tests).
 */
@Module({})
export class AppModule {
  static register(config: AppConfig, database: DatabaseHandle): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        DatabaseModule.forRoot(database),
        ...COMMON_MODULES,
        ...(MODULES_BY_MODE[config.mode] ?? []),
      ],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        { provide: Clock, useClass: SystemClock },
      ],
      exports: [APP_CONFIG, Clock],
    };
  }
}
