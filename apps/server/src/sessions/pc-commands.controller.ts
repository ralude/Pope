import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  type PcCommandRequest,
  pcCommandRequestSchema,
  type PcWakeRequest,
  pcWakeRequestSchema,
  type StaffProfile,
} from '@pope/shared';

import { CurrentStaff, Roles } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PcCommandRequestsService } from './pc-command-requests.service.js';
import { PcCommandException, PcCommandsService } from './pc-commands.service.js';
import { PcWakeService } from './pc-wake.service.js';

/** Una petición que no cumple el contrato responde con el error de órdenes (plan T02b). */
class CommandRequestPipe extends ZodValidationPipe<typeof pcCommandRequestSchema> {
  constructor() {
    super(pcCommandRequestSchema);
  }

  override transform(value: unknown): PcCommandRequest {
    try {
      return super.transform(value);
    } catch {
      // REQ-003-20: reiniciar o apagar con una sesión o un mantenimiento exige confirmarlo.
      const confirmed = pcCommandRequestSchema.safeParse({ ...(value as object), confirmed: true });
      if (
        confirmed.success &&
        (confirmed.data.kind === 'restart' || confirmed.data.kind === 'powerOff')
      ) {
        throw new PcCommandException(
          'confirmation_required',
          'Confirma el cierre de la sesión antes de reiniciar o apagar',
          400,
        );
      }
      throw new PcCommandException('invalid_command', 'Orden no válida', 400);
    }
  }
}

/** Órdenes del panel a las PCs (spec 003, T28). El dueño solo consulta. */
@Controller('pcs/:pcId')
export class PcCommandsController {
  constructor(
    private readonly commands: PcCommandsService,
    private readonly requests: PcCommandRequestsService,
    private readonly wakes: PcWakeService,
  ) {}

  @Get('control')
  @Header('Cache-Control', 'no-store')
  control(@Param('pcId', ParseUUIDPipe) pcId: string) {
    return this.commands.snapshot(pcId);
  }

  /** Estado de una orden: el panel la consulta hasta su resultado (T41). */
  @Get('commands/:commandId')
  @Header('Cache-Control', 'no-store')
  command(
    @Param('pcId', ParseUUIDPipe) pcId: string,
    @Param('commandId', ParseUUIDPipe) commandId: string,
  ) {
    return this.commands.get(pcId, commandId);
  }

  @Post('commands')
  @HttpCode(200)
  @Roles('encargado', 'administrador')
  issue(
    @Param('pcId', ParseUUIDPipe) pcId: string,
    @Body(new CommandRequestPipe()) body: PcCommandRequest,
    @CurrentStaff() member: StaffProfile,
  ) {
    return this.requests.issue(pcId, body, {
      kind: 'staff',
      staffId: member.id,
      name: member.displayName,
    });
  }

  /** Encender por Wake-on-LAN (REQ-003-22): el nodo envía el paquete, no hay orden a la PC. */
  @Post('wake')
  @HttpCode(200)
  @Roles('encargado', 'administrador')
  wake(
    @Param('pcId', ParseUUIDPipe) pcId: string,
    @Body(new ZodValidationPipe(pcWakeRequestSchema)) body: PcWakeRequest,
    @CurrentStaff() member: StaffProfile,
  ) {
    return this.wakes.wake(pcId, body, {
      kind: 'staff',
      staffId: member.id,
      name: member.displayName,
    });
  }
}
