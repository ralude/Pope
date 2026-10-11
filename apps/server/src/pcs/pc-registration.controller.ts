import { Body, Controller, Header, HttpCode, Post } from '@nestjs/common';
import {
  pcInstallationCodeRequestSchema,
  pcRegistrationRequestSchema,
  type PcInstallationCodeRequest,
  type PcRegistrationRequest,
  type StaffProfile,
} from '@pope/shared';

import { CurrentStaff, Public, Roles } from '../auth/decorators.js';
import { staffActor } from '../auth/staff.controller.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PcRegistrationException, PcRegistrationService } from './pc-registration.service.js';

/** Error público sin detalles de validación que puedan incluir secretos (T01/T12). */
class RegistrationPipe extends ZodValidationPipe<typeof pcRegistrationRequestSchema> {
  constructor() {
    super(pcRegistrationRequestSchema);
  }

  override transform(value: unknown): PcRegistrationRequest {
    try {
      return super.transform(value);
    } catch {
      throw new PcRegistrationException('invalid_registration', 'Datos de registro no válidos');
    }
  }
}

@Controller('pcs')
export class PcRegistrationController {
  constructor(private readonly registration: PcRegistrationService) {}

  @Post('installation-codes')
  @Roles('encargado', 'administrador')
  @Header('Cache-Control', 'no-store')
  issue(
    @Body(new ZodValidationPipe(pcInstallationCodeRequestSchema)) body: PcInstallationCodeRequest,
    @CurrentStaff() member: StaffProfile,
  ) {
    return this.registration.issue(body, staffActor(member));
  }

  @Public()
  @Post('register')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  register(@Body(new RegistrationPipe()) body: PcRegistrationRequest) {
    return this.registration.register(body);
  }
}
