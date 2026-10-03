import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  type CashShift,
  type CurrentShiftResponse,
  type OpeningCash,
  openingCashSchema,
  type ShiftClosing,
  type ShiftCloseRequest,
  shiftCloseRequestSchema,
  type ShiftSummary,
  type StaffProfile,
} from '@pope/shared';

import { CurrentStaff, Roles } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ShiftsService } from './shifts.service.js';

/**
 * Caja de turno del local (T17, REQ-005-40 a REQ-005-44). La operan el encargado y el
 * administrador; el historial lo ven el administrador y el dueño.
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

  /** Abre la caja con el fondo inicial. Responde 409 si ya hay una abierta en el local. */
  @Post()
  open(
    @Body(new ZodValidationPipe(openingCashSchema)) body: OpeningCash,
    @CurrentStaff() member: StaffProfile,
  ): Promise<CashShift> {
    return this.shifts.open(member, body);
  }

  /** Lo esperado por método, para cerrar (REQ-005-42). Responde 409 si no hay caja. */
  @Get('current/closing')
  closing(): Promise<ShiftClosing> {
    return this.shifts.closing();
  }

  /**
   * Cierra la caja con lo contado: quien la abrió o un administrador. Responde el cierre con
   * lo esperado y la diferencia; 409 si no hay caja.
   */
  @Post('current/close')
  @HttpCode(200)
  close(
    @Body(new ZodValidationPipe(shiftCloseRequestSchema)) body: ShiftCloseRequest,
    @CurrentStaff() member: StaffProfile,
  ): Promise<ShiftSummary> {
    return this.shifts.close(member, body.counted);
  }

  /** Historial de cajas, la más reciente arriba (REQ-005-53). */
  @Roles('administrador', 'dueno')
  @Get()
  history(): Promise<ShiftSummary[]> {
    return this.shifts.history();
  }
}
