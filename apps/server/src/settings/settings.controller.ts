import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  type Settings,
  type SettingsUpdateRequest,
  settingsUpdateRequestSchema,
  type StaffProfile,
} from '@pope/shared';

import { CurrentStaff, Roles } from '../auth/decorators.js';
import { staffActor } from '../auth/staff.controller.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SettingsService } from './settings.service.js';

/** Ajustes del nodo: todo el personal los consulta y solo el administrador los cambia. */
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(): Promise<Settings> {
    return this.settings.get();
  }

  /** Cambia uno o varios ajustes (REQ-001-27, REQ-001-64). Devuelve todos. */
  @Roles('administrador')
  @Put()
  update(
    @Body(new ZodValidationPipe(settingsUpdateRequestSchema)) body: SettingsUpdateRequest,
    @CurrentStaff() admin: StaffProfile,
  ): Promise<Settings> {
    return this.settings.update(body, staffActor(admin));
  }
}
