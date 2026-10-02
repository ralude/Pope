import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { CashShift, CurrentShiftResponse, StaffProfile } from '@pope/shared';

import { CurrentStaff, Roles } from '../auth/decorators.js';
import { ShiftsService } from './shifts.service.js';

/**
 * Caja de turno del local (T17, REQ-005-44). Solo quien opera la caja (encargado y
 * administrador); el dueño no cobra.
 */
@Roles('encargado', 'administrador')
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  /** La caja abierta del local, o `{ shift: null }`. */
  @Get('current')
  async current(): Promise<CurrentShiftResponse> {
    return { shift: await this.shifts.findOpen() };
  }

  /** Abre la caja. Responde 409 si ya hay una abierta en el local. */
  @Post()
  open(@CurrentStaff() member: StaffProfile): Promise<CashShift> {
    return this.shifts.open(member);
  }

  /** Cierra la caja: quien la abrió o un administrador. Responde 409 si no hay ninguna. */
  @Post('current/close')
  @HttpCode(200)
  close(@CurrentStaff() member: StaffProfile): Promise<CashShift> {
    return this.shifts.close(member);
  }
}
