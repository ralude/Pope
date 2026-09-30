import { Controller, Get } from '@nestjs/common';
import type { InterruptedSessions, TemporaryBackup } from '@pope/shared';

import { TemporarySessionsService } from './temporary-sessions.service.js';

/**
 * Consulta del respaldo de sesiones temporales y de las interrumpidas. Solo lectura: la ve
 * todo el personal, también el dueño (REQ-001-64, REQ-001-66).
 */
@Controller('sessions/temporary')
export class TemporaryBackupController {
  constructor(private readonly temporary: TemporarySessionsService) {}

  /**
   * Las últimas N sesiones temporales de cada PC (N del ajuste, mínimo 3) y las
   * interrumpidas pendientes de restaurar, aunque haya más sesiones nuevas.
   */
  @Get('backup')
  backup(): Promise<TemporaryBackup> {
    return this.temporary.backup();
  }

  /** "Sesiones interrumpidas": las que un corte dejó con tiempo y aún se pueden restaurar. */
  @Get('interrupted')
  async interrupted(): Promise<InterruptedSessions> {
    return { sessions: await this.temporary.interrupted() };
  }
}
