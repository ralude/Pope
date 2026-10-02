import { Body, Controller, Get, HttpCode, Put } from '@nestjs/common';
import {
  type PcMap,
  type PcMapLayoutRequest,
  pcMapLayoutRequestSchema,
  type StaffProfile,
} from '@pope/shared';

import { CurrentStaff, Roles } from '../auth/decorators.js';
import { staffActor } from '../auth/staff.controller.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PcLayoutService } from './pc-layout.service.js';
import { PcMapService } from './pc-map.service.js';

/**
 * PCs del local para el panel. El mapa lo consulta todo el personal (REQ-001-31) y solo el
 * administrador lo organiza (REQ-001-45).
 */
@Controller('pcs')
export class PcMapController {
  constructor(
    private readonly map: PcMapService,
    private readonly layout: PcLayoutService,
  ) {}

  /** Todas las PCs con su posición, su conexión y su sesión activa. En vivo: el canal `/panel`. */
  @Get('map')
  snapshot(): Promise<PcMap> {
    return this.map.snapshot();
  }

  /** Guarda la distribución completa del mapa. Las PCs que no vienen quedan sin posición. */
  @Roles('administrador')
  @Put('map')
  @HttpCode(204)
  async saveLayout(
    @Body(new ZodValidationPipe(pcMapLayoutRequestSchema)) body: PcMapLayoutRequest,
    @CurrentStaff() admin: StaffProfile,
  ): Promise<void> {
    await this.layout.save(body, staffActor(admin));
  }
}
