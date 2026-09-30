import { Body, ConflictException, Controller, Param, Post } from '@nestjs/common';
import {
  type ComboPurchaseRequest,
  comboPurchaseRequestSchema,
  type Customer,
  idSchema,
  type StaffProfile,
} from '@pope/shared';

import { CurrentStaff, Roles } from '../auth/decorators.js';
import { staffActor } from '../auth/staff.controller.js';
import type { ComboPayment } from '../combos/combo-sales.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { NO_OPEN_SHIFT_MESSAGE } from '../shifts/open-shift.guard.js';
import { ShiftsService } from '../shifts/shifts.service.js';
import { SessionsService } from './sessions.service.js';

/**
 * Venta de combos desde el panel (REQ-001-84, REQ-001-85). Vive en el módulo de sesiones
 * porque, si el cliente está usando una PC, hay que cobrar su sesión antes de vender.
 */
@Roles('encargado', 'administrador')
@Controller('customers/:id')
export class ComboSalesController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly shifts: ShiftsService,
  ) {}

  /**
   * En caja exige turno abierto, porque entra dinero (REQ-001-84); con saldo no hace falta
   * (REQ-001-85).
   */
  @Post('combo-purchases')
  async purchase(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(comboPurchaseRequestSchema)) body: ComboPurchaseRequest,
    @CurrentStaff() member: StaffProfile,
  ): Promise<Customer> {
    let payment: ComboPayment = { via: 'balance' };
    if (body.payment.via === 'cash_desk') {
      const shift = await this.shifts.findOpen(member.id);
      if (!shift) {
        throw new ConflictException(NO_OPEN_SHIFT_MESSAGE);
      }
      payment = { via: 'cash_desk', paymentMethod: body.payment.paymentMethod, shiftId: shift.id };
    }
    return this.sessions.sellCombo(id, body.comboId, payment, staffActor(member));
  }
}
