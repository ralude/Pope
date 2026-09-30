import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { idSchema, type StaffProfile } from '@pope/shared';

import { CurrentStaff, Roles } from '../auth/decorators.js';
import { staffActor } from '../auth/staff.controller.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SessionsService } from './sessions.service.js';

/** Sesiones de las PCs desde el panel del local. El dueño solo lee. */
@Roles('encargado', 'administrador')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  /**
   * Cierra cualquier sesión, con cuenta o temporal (REQ-001-26): cobra hasta este momento y
   * la PC se bloquea. Responde 404 si no existe y 409 si ya estaba cerrada.
   */
  @Post(':id/close')
  @HttpCode(204)
  async close(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @CurrentStaff() member: StaffProfile,
  ): Promise<void> {
    await this.sessions.closeByStaff(id, staffActor(member));
  }
}
