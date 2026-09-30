import { Body, Controller, Post } from '@nestjs/common';
import {
  type CashShift,
  type StaffProfile,
  type TemporaryOpenRequest,
  temporaryOpenRequestSchema,
  type TemporarySession,
} from '@pope/shared';

import { CurrentStaff, Roles } from '../auth/decorators.js';
import { staffActor } from '../auth/staff.controller.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentShift, RequiresOpenShift } from '../shifts/open-shift.guard.js';
import { TemporarySessionsService } from './temporary-sessions.service.js';

/**
 * Sesiones temporales desde el panel del local (REQ-001-60 a REQ-001-71). Las abre quien
 * cobra en caja: encargado o administrador, con un turno abierto.
 */
@Roles('encargado', 'administrador')
@Controller('sessions')
export class TemporarySessionsController {
  constructor(private readonly temporary: TemporarySessionsService) {}

  /**
   * Abre una sesión temporal en una PC libre y conectada, con el tiempo o el importe que
   * paga el cliente (REQ-001-60). Responde 409 sin turno abierto.
   */
  @RequiresOpenShift()
  @Post('temporary')
  open(
    @Body(new ZodValidationPipe(temporaryOpenRequestSchema)) body: TemporaryOpenRequest,
    @CurrentShift() shift: CashShift,
    @CurrentStaff() member: StaffProfile,
  ): Promise<TemporarySession> {
    return this.temporary.open(body, shift, staffActor(member));
  }
}
