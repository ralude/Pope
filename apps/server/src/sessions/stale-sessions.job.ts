import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

import { Clock } from '../common/clock.js';
import { SettingsService } from '../settings/settings.service.js';
import { SessionsService } from './sessions.service.js';

/** Cada cuánto se buscan sesiones sin latidos. */
export const STALE_CHECK_INTERVAL_MS = 10_000;

/**
 * Cierra las sesiones cuya PC dejó de enviar latidos más tiempo que el de gracia (REQ-001-27,
 * CA-001-03): cobra hasta el último latido y las cierra como `no_heartbeat`. Corre al
 * arrancar el nodo, para las que dejó así un apagón, y luego de forma periódica.
 */
@Injectable()
export class StaleSessionsJob implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('StaleSessions');
  private cancel: (() => void) | null = null;
  private stopped = false;

  constructor(
    private readonly sessions: SessionsService,
    private readonly settings: SettingsService,
    private readonly clock: Clock,
  ) {}

  /** La primera revisión termina antes de que el nodo empiece a atender a las PCs. */
  async onApplicationBootstrap(): Promise<void> {
    await this.run();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    this.cancel?.();
  }

  private async run(): Promise<void> {
    try {
      const { heartbeatGraceSeconds } = await this.settings.get();
      const limit = new Date(this.clock.now().getTime() - heartbeatGraceSeconds * 1000);
      await this.sessions.closeStale(limit);
    } catch (error) {
      this.logger.error('No se pudieron cerrar las sesiones sin latidos', error);
    }
    if (!this.stopped) {
      this.cancel = this.clock.schedule(STALE_CHECK_INTERVAL_MS, () => this.run());
    }
  }
}
