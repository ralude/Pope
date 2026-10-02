import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  type ExchangeRateSetRequest,
  exchangeRateSetRequestSchema,
  type ExchangeRateStatus,
  type StaffProfile,
} from '@pope/shared';

import { CurrentStaff, Roles } from '../auth/decorators.js';
import { staffActor } from '../auth/staff.controller.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ExchangeRatesService } from './exchange-rates.service.js';

/**
 * Tasa de cambio (spec 005, parte 1). Todo el personal la consulta; el encargado y el
 * administrador la escriben a mano (REQ-005-34). El dueño solo la ve.
 */
@Controller('exchange-rate')
export class ExchangeRatesController {
  constructor(private readonly rates: ExchangeRatesService) {}

  /** La tasa vigente y si está desactualizada (REQ-005-33, REQ-005-35). */
  @Get()
  get(): ExchangeRateStatus {
    return this.rates.status();
  }

  /** Guarda una tasa manual, que vale desde ahora (REQ-005-34). */
  @Roles('encargado', 'administrador')
  @Post()
  set(
    @Body(new ZodValidationPipe(exchangeRateSetRequestSchema)) body: ExchangeRateSetRequest,
    @CurrentStaff() staff: StaffProfile,
  ): Promise<ExchangeRateStatus> {
    return this.rates.setManual(body.vesPerUsd, staffActor(staff));
  }
}
