import { Global, Module } from '@nestjs/common';

import { EventsService } from './events.service.js';

/** Transacciones con eventos, disponibles para todos los módulos del nodo local. */
@Global()
@Module({
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
