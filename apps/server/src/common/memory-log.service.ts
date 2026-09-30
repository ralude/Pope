import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../config.js';
import { Clock } from './clock.js';

const MB = 1024 * 1024;

/** `Memoria: rss=123.4 MB heapUsed=45.6 MB`, con la memoria del proceso en MB. */
export function memoryLine(usage: Pick<NodeJS.MemoryUsage, 'rss' | 'heapUsed'>): string {
  const mb = (bytes: number) => (bytes / MB).toFixed(1);
  return `Memoria: rss=${mb(usage.rss)} MB heapUsed=${mb(usage.heapUsed)} MB`;
}

/**
 * Registra la memoria del proceso cada `POPE_MEMORY_LOG_MS` ms, si se pidió. Sirve para
 * comprobar el presupuesto de ADR-0011 durante la prueba de carga; desactivado por defecto.
 * El servidor de Pope tiene que caber en unos 384 MB de Node en el equipo del local.
 */
@Injectable()
export class MemoryLogService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Memoria');
  private cancel: (() => void) | null = null;
  private stopped = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.memoryLogMs !== null) {
      this.scheduleNext(this.config.memoryLogMs);
    }
  }

  onModuleDestroy(): void {
    this.stopped = true;
    this.cancel?.();
  }

  private scheduleNext(everyMs: number): void {
    this.cancel = this.clock.schedule(everyMs, () => {
      this.logger.log(memoryLine(process.memoryUsage()));
      if (!this.stopped) {
        this.scheduleNext(everyMs);
      }
      return Promise.resolve();
    });
  }
}
