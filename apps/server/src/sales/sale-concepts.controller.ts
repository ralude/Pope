import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  idSchema,
  type SaleConcept,
  type SaleConceptCreateRequest,
  saleConceptCreateRequestSchema,
  type SaleConceptUpdateRequest,
  saleConceptUpdateRequestSchema,
  type StaffProfile,
} from '@pope/shared';

import { CurrentStaff, Roles } from '../auth/decorators.js';
import { staffActor } from '../auth/staff.controller.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SaleConceptsService } from './sale-concepts.service.js';

/**
 * Conceptos de venta sin inventario. Todo el personal los ve (el encargado los vende); solo
 * el administrador los da de alta, edita o desactiva (REQ-005-05). No se borran.
 */
@Controller('sale-concepts')
export class SaleConceptsController {
  constructor(private readonly concepts: SaleConceptsService) {}

  @Get()
  list(): Promise<SaleConcept[]> {
    return this.concepts.list();
  }

  @Roles('administrador')
  @Post()
  create(
    @Body(new ZodValidationPipe(saleConceptCreateRequestSchema)) body: SaleConceptCreateRequest,
    @CurrentStaff() admin: StaffProfile,
  ): Promise<SaleConcept> {
    return this.concepts.create(body, staffActor(admin));
  }

  @Roles('administrador')
  @Patch(':id')
  update(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(saleConceptUpdateRequestSchema)) body: SaleConceptUpdateRequest,
    @CurrentStaff() admin: StaffProfile,
  ): Promise<SaleConcept> {
    return this.concepts.update(id, body, staffActor(admin));
  }
}
