import { type DynamicModule, Module } from '@nestjs/common';

import { APP_CONFIG, type AppConfig, type PopeMode } from './config.js';
import { HealthModule } from './health/health.module.js';

/** Módulos que se cargan en los dos modos. */
const COMMON_MODULES = [HealthModule];

/** Módulos propios de cada modo (ADR-0003). Cada spec añade aquí los suyos. */
const MODULES_BY_MODE: Record<PopeMode, DynamicModule['imports']> = {
  local: [],
  cloud: [],
};

/** Módulo raíz: carga los módulos comunes y los del modo indicado en `POPE_MODE`. */
@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [...COMMON_MODULES, ...(MODULES_BY_MODE[config.mode] ?? [])],
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
