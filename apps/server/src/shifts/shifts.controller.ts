import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { CashShift, CurrentShiftResponse, StaffProfile } from '@pope/shared';

import { CurrentStaff, Roles } from '../auth/decorators.js';
import { ShiftsService } from './shifts.service.js';

/**
 * Turno de caja de quien usa el panel (T17). Solo quien opera la caja (encargado y
 * administrador); el dueño no cobra.
 */
@Roles('encargado', 'administrador')
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  /** El turno abierto de quien pregunta, o `{ shift: null }`. */
  @Get('current')
  async current(@CurrentStaff() member: StaffProfile): Promise<CurrentShiftResponse> {
    return { shift: await this.shifts.findOpen(member.id) };
  }

  /** Abre turno. Responde 409 si ya tiene uno abierto. */
  @Post()
  open(@CurrentStaff() member: StaffProfile): Promise<CashShift> {
    return this.shifts.open(member);
  }

  /** Cierra el turno abierto. Responde 409 si no tiene ninguno. */
  @Post('current/close')
  @HttpCode(200)
  close(@CurrentStaff() member: StaffProfile): Promise<CashShift> {
    return this.shifts.close(member);
  }
}
