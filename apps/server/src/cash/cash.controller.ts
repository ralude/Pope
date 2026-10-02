import { ConflictException, Controller, Get } from '@nestjs/common';
import type { ShiftEntriesResponse } from '@pope/shared';

import { ShiftsService } from '../shifts/shifts.service.js';
import { CashRegisterService } from './cash-register.service.js';

/** Lo cobrado en la caja, para todo el personal (REQ-005-24). */
@Controller('shifts')
export class CashController {
  constructor(
    private readonly register: CashRegisterService,
    private readonly shifts: ShiftsService,
  ) {}

  /** Movimientos de la caja abierta, el más reciente arriba. Responde 409 si no hay caja. */
  @Get('current/entries')
  async current(): Promise<ShiftEntriesResponse> {
    const shift = await this.shifts.findOpen();
    if (!shift) {
      throw new ConflictException('No hay una caja abierta');
    }
    return this.register.list(shift.id);
  }
}
