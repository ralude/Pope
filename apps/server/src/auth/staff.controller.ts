import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  type Actor,
  idSchema,
  type StaffCreateRequest,
  staffCreateRequestSchema,
  type StaffListItem,
  type StaffProfile,
  type StaffStatusRequest,
  staffStatusRequestSchema,
} from '@pope/shared';

import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentStaff, Roles } from './decorators.js';
import { StaffService } from './staff.service.js';

/** El miembro del personal que hace la acción, como actor de los eventos. */
export function staffActor(member: StaffProfile): Actor {
  return { kind: 'staff', staffId: member.id, name: member.displayName };
}

/** Gestión del personal del local, solo para el administrador (T14d, REQ-001-40). */
@Roles('administrador')
@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  list(): Promise<StaffListItem[]> {
    return this.staff.list();
  }

  /** Alta de un encargado, administrador o dueño. Responde 409 si el usuario ya existe. */
  @Post()
  async create(
    @Body(new ZodValidationPipe(staffCreateRequestSchema)) body: StaffCreateRequest,
    @CurrentStaff() admin: StaffProfile,
  ): Promise<StaffListItem> {
    const created = await this.staff.create(body, staffActor(admin));
    return this.staff.get(created.id);
  }

  /** Activa o desactiva. Al desactivar, sus sesiones del panel dejan de valer al instante. */
  @Patch(':id/status')
  setStatus(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(staffStatusRequestSchema)) body: StaffStatusRequest,
    @CurrentStaff() admin: StaffProfile,
  ): Promise<StaffListItem> {
    return this.staff.setActive(id, body.active, staffActor(admin));
  }
}
