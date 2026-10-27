import {
  type BeforeApplicationShutdown,
  Injectable,
  type OnApplicationBootstrap,
} from '@nestjs/common';

import { EventsService } from '../events/events.service.js';
import { PcConnections } from './pc-connections.js';

/**
 * Avisa en vivo a las PCs conectadas cuando el administrador cambia el fondo (REQ-003-72).
 * Solo envía los metadatos: la imagen la descarga cada agente con su credencial.
 */
@Injectable()
export class LockBackgroundNotifier implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly events: EventsService,
    private readonly connections: PcConnections,
  ) {}

  onApplicationBootstrap(): void {
    // Los oyentes reciben solo lo ya confirmado: nunca se avisa de un cambio que se deshizo.
    this.unsubscribe = this.events.subscribe((committed) => {
      for (const event of committed) {
        if (event.type !== 'lock_screen.background_changed') continue;
        this.connections.broadcast({
          type: 'lockBackground',
          revision: event.payload.revision,
          background: event.payload.background,
        });
      }
    });
  }

  beforeApplicationShutdown(): void {
    this.unsubscribe?.();
  }
}
