import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  type CashShift,
  type Customer,
  idSchema,
  type RechargeRequest,
  rechargeRequestSchema,
  type StaffProfile,
} from '@pope/shared';

import { CurrentStaff, Roles } from '../auth/decorators.js';
import { staffActor } from '../auth/staff.controller.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentShift, RequiresOpenShift } from '../shifts/open-shift.guard.js';
import { WalletService } from './wallet.service.js';

/** Movimientos de saldo desde el panel: recargas en caja (REQ-001-03). */
@Roles('encargado', 'administrador')
@Controller('customers/:id')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  /** Recarga ligada al turno de quien cobra; responde 409 sin turno abierto. */
  @RequiresOpenShift()
  @Post('recharges')
  recharge(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(rechargeRequestSchema)) body: RechargeRequest,
    @CurrentShift() shift: CashShift,
    @CurrentStaff() member: StaffProfile,
  ): Promise<Customer> {
    return this.wallet.recharge(id, body, shift, staffActor(member));
  }
}
