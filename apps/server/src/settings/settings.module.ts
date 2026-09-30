import { Module } from '@nestjs/common';

import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';

/** Ajustes del nodo que cambia el administrador (REQ-001-27, REQ-001-64). */
@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
