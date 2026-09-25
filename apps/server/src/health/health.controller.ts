import { Controller, Get, Inject } from '@nestjs/common';

import { Public } from '../auth/decorators.js';
import { APP_CONFIG, type AppConfig, type PopeMode } from '../config.js';

export interface HealthResponse {
  status: 'ok';
  mode: PopeMode;
}

/** Comprobación de que el servidor responde, para el instalador y la supervisión. */
@Public()
@Controller('health')
export class HealthController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Get()
  check(): HealthResponse {
    return { status: 'ok', mode: this.config.mode };
  }
}
