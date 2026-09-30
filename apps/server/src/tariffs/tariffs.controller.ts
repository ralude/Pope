import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  type StaffProfile,
  type TariffTable,
  type TariffUpdateRequest,
  tariffUpdateRequestSchema,
} from '@pope/shared';

import { CurrentStaff, Roles } from '../auth/decorators.js';
import { staffActor } from '../auth/staff.controller.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { TariffsService } from './tariffs.service.js';

/** Tarifa semanal: todo el personal la consulta y solo el administrador la cambia. */
@Controller('tariffs')
export class TariffsController {
  constructor(private readonly tariffs: TariffsService) {}

  @Get()
  table(): Promise<TariffTable> {
    return this.tariffs.table();
  }

  /** Mismo precio para uno o varios días (REQ-001-15). Devuelve la tabla completa. */
  @Roles('administrador')
  @Put()
  update(
    @Body(new ZodValidationPipe(tariffUpdateRequestSchema)) body: TariffUpdateRequest,
    @CurrentStaff() admin: StaffProfile,
  ): Promise<TariffTable> {
    return this.tariffs.update(body, staffActor(admin));
  }
}
