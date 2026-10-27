import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Put,
  StreamableFile,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { type LockBackgroundSnapshot, sha256HexSchema, type StaffProfile } from '@pope/shared';

import { CurrentStaff, Public, Roles } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PcAuthenticationService } from '../pcs/pc-authentication.service.js';
import { LockBackgroundService } from './lock-background.service.js';

/** Fondo global de la pantalla de bloqueo; solo el administrador lo cambia (REQ-003-70). */
@Controller('lock-background')
export class LockBackgroundController {
  constructor(
    private readonly background: LockBackgroundService,
    private readonly pcAuthentication: PcAuthenticationService,
  ) {}

  /** Lo consulta todo el personal con sesión (guard global), incluido el dueño. */
  @Get()
  get(): Promise<LockBackgroundSnapshot> {
    return this.background.get();
  }

  /** Cuerpo `image/webp` ya reducido por el panel; el tipo lo comprueba el parser de `bootstrap.ts`. */
  @Roles('administrador')
  @Put()
  set(@Body() body: unknown, @CurrentStaff() admin: StaffProfile): Promise<LockBackgroundSnapshot> {
    if (!Buffer.isBuffer(body)) {
      throw new UnsupportedMediaTypeException('El fondo debe ser una imagen WebP');
    }
    return this.background.set(body, { kind: 'staff', staffId: admin.id, name: admin.displayName });
  }

  /**
   * Descarga del fondo por su huella (REQ-003-73). La pide el agente de la PC con su credencial
   * (ADR-0017), no el personal: por eso es `@Public()` y autentica a mano.
   */
  @Public()
  @Get('image/:sha256')
  async image(
    @Param('sha256', new ZodValidationPipe(sha256HexSchema)) sha256: string,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<StreamableFile> {
    const result = await this.pcAuthentication.authenticate(authorization);
    if (!result.ok) {
      throw new UnauthorizedException(result.error);
    }
    return new StreamableFile(await this.background.read(sha256), { type: 'image/webp' });
  }
}
