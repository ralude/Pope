import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  type CashMovement,
  type CashShift,
  idSchema,
  type SaleRequest,
  saleRequestSchema,
  type SaleVoidRequest,
  saleVoidRequestSchema,
  type StaffProfile,
} from '@pope/shared';

import { CurrentStaff, Roles } from '../auth/decorators.js';
import { staffActor } from '../auth/staff.controller.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentShift, RequiresOpenShift } from '../shifts/open-shift.guard.js';
import { SalesService } from './sales.service.js';

/** Ventas del mostrador: las registran el encargado y el administrador (REQ-005-20). */
@Roles('encargado', 'administrador')
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  /**
   * Registra una venta en la caja abierta (REQ-005-43: sin caja, 409) y responde su
   * movimiento, tal como aparece en la lista de la caja.
   */
  @RequiresOpenShift()
  @Post()
  record(
    @Body(new ZodValidationPipe(saleRequestSchema)) body: SaleRequest,
    @CurrentShift() shift: CashShift,
    @CurrentStaff() member: StaffProfile,
  ): Promise<CashMovement> {
    return this.sales.record(body, shift, staffActor(member));
  }

  /**
   * Anula una venta de la caja abierta, con motivo: solo el administrador (REQ-005-23).
   * Responde la fila de la anulación, tal como aparece en la lista de la caja.
   */
  @Roles('administrador')
  @Post(':id/void')
  void(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(saleVoidRequestSchema)) body: SaleVoidRequest,
    @CurrentStaff() admin: StaffProfile,
  ): Promise<CashMovement> {
    return this.sales.void(id, body.reason, staffActor(admin));
  }
}
