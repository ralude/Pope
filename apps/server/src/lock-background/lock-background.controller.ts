import { Body, Controller, Put, UnsupportedMediaTypeException } from '@nestjs/common';
import { type LockBackgroundSnapshot, type StaffProfile } from '@pope/shared';

import { CurrentStaff, Roles } from '../auth/decorators.js';
import { LockBackgroundService } from './lock-background.service.js';

/** Fondo global de la pantalla de bloqueo; solo el administrador lo cambia (REQ-003-70). */
@Controller('lock-background')
export class LockBackgroundController {
  constructor(private readonly background: LockBackgroundService) {}

  /** Cuerpo `image/webp` ya reducido por el panel; el tipo lo comprueba el parser de `bootstrap.ts`. */
  @Roles('administrador')
  @Put()
  set(@Body() body: unknown, @CurrentStaff() admin: StaffProfile): Promise<LockBackgroundSnapshot> {
    if (!Buffer.isBuffer(body)) {
      throw new UnsupportedMediaTypeException('El fondo debe ser una imagen WebP');
    }
    return this.background.set(body, { kind: 'staff', staffId: admin.id, name: admin.displayName });
  }
}
