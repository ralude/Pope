import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  type Combo,
  type ComboCreateRequest,
  comboCreateRequestSchema,
  type ComboUpdateRequest,
  comboUpdateRequestSchema,
  idSchema,
  type StaffProfile,
} from '@pope/shared';

import { CurrentStaff, Roles } from '../auth/decorators.js';
import { staffActor } from '../auth/staff.controller.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CombosService } from './combos.service.js';

/**
 * Combos de horas. Todo el personal los consulta (el encargado los vende); solo el
 * administrador los crea, edita o desactiva (REQ-001-80, REQ-001-81). No se borran.
 */
@Controller('combos')
export class CombosController {
  constructor(private readonly combos: CombosService) {}

  @Get()
  list(): Promise<Combo[]> {
    return this.combos.list();
  }

  @Get(':id')
  get(@Param('id', new ZodValidationPipe(idSchema)) id: string): Promise<Combo> {
    return this.combos.get(id);
  }

  @Roles('administrador')
  @Post()
  create(
    @Body(new ZodValidationPipe(comboCreateRequestSchema)) body: ComboCreateRequest,
    @CurrentStaff() admin: StaffProfile,
  ): Promise<Combo> {
    return this.combos.create(body, staffActor(admin));
  }

  @Roles('administrador')
  @Patch(':id')
  update(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(comboUpdateRequestSchema)) body: ComboUpdateRequest,
    @CurrentStaff() admin: StaffProfile,
  ): Promise<Combo> {
    return this.combos.update(id, body, staffActor(admin));
  }
}
