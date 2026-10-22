import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  type PcContinueRequest,
  pcContinueRequestSchema,
  type PcRevokeRequest,
  pcRevokeRequestSchema,
  type StaffProfile,
} from '@pope/shared';

import { CurrentStaff, Roles } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PcRevocationService } from './pc-revocation.service.js';

/**
 * Revocar, revincular y autorizar continuar (spec 003, T34; ADR-0021): encargado y
 * administrador; el dueño solo lee. El nodo valida la sesión del personal en cada acción.
 */
@Controller('pcs/:pcId')
export class PcRevocationController {
  constructor(private readonly revocation: PcRevocationService) {}

  @Post('revoke')
  @HttpCode(200)
  @Roles('encargado', 'administrador')
  revoke(
    @Param('pcId', ParseUUIDPipe) pcId: string,
    @Body(new ZodValidationPipe(pcRevokeRequestSchema)) body: PcRevokeRequest,
    @CurrentStaff() member: StaffProfile,
  ) {
    return this.revocation.revoke(pcId, body, {
      kind: 'staff',
      staffId: member.id,
      name: member.displayName,
    });
  }

  @Post('continue')
  @HttpCode(200)
  @Roles('encargado', 'administrador')
  authorizeContinue(
    @Param('pcId', ParseUUIDPipe) pcId: string,
    @Body(new ZodValidationPipe(pcContinueRequestSchema)) body: PcContinueRequest,
    @CurrentStaff() member: StaffProfile,
  ) {
    return this.revocation.authorizeContinue(pcId, body, {
      kind: 'staff',
      staffId: member.id,
      name: member.displayName,
    });
  }
}
