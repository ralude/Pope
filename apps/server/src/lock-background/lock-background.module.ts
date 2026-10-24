import { Module } from '@nestjs/common';

import { LockBackgroundController } from './lock-background.controller.js';
import { LockBackgroundService } from './lock-background.service.js';

/** Fondo global de la pantalla de bloqueo (spec 003, REQ-003-70 a REQ-003-76). */
@Module({
  controllers: [LockBackgroundController],
  providers: [LockBackgroundService],
})
export class LockBackgroundModule {}
