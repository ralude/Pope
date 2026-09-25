import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  type Customer,
  type CustomerCreateRequest,
  customerCreateRequestSchema,
  type CustomerPage,
  type CustomerSearchQuery,
  customerSearchQuerySchema,
  type CustomerStatusRequest,
  customerStatusRequestSchema,
  idSchema,
  type StaffProfile,
} from '@pope/shared';

import { CurrentStaff, Roles } from '../auth/decorators.js';
import { staffActor } from '../auth/staff.controller.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CustomersService } from './customers.service.js';

/**
 * Cuentas de cliente en el panel (REQ-001-01, REQ-001-04). El encargado y el administrador
 * las crean y cambian de estado; el dueño solo las consulta.
 */
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Roles('encargado', 'administrador')
  @Post()
  create(
    @Body(new ZodValidationPipe(customerCreateRequestSchema)) body: CustomerCreateRequest,
    @CurrentStaff() member: StaffProfile,
  ): Promise<Customer> {
    return this.customers.create(body, staffActor(member));
  }

  /** Lista paginada; con `q` busca por usuario, nombre o teléfono. */
  @Get()
  search(
    @Query(new ZodValidationPipe(customerSearchQuerySchema)) query: CustomerSearchQuery,
  ): Promise<CustomerPage> {
    return this.customers.search(query);
  }

  @Get(':id')
  get(@Param('id', new ZodValidationPipe(idSchema)) id: string): Promise<Customer> {
    return this.customers.get(id);
  }

  /** Activa, bloquea o desactiva la cuenta (mismo efecto, distinto motivo). */
  @Roles('encargado', 'administrador')
  @Patch(':id/status')
  setStatus(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(customerStatusRequestSchema)) body: CustomerStatusRequest,
    @CurrentStaff() member: StaffProfile,
  ): Promise<Customer> {
    return this.customers.setStatus(id, body.status, staffActor(member));
  }
}
