import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { StaffRole } from '@pope/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { APP_CONFIG, type AppConfig } from '../config.js';
import { AuthService } from './auth.service.js';
import { IS_PUBLIC, ROLES } from './decorators.js';
import { STAFF_COOKIE, staffCookieOptions } from './staff-cookie.js';

/**
 * Protege todos los endpoints HTTP del nodo local (REQ-001-40): exige una sesión del
 * personal salvo en los marcados con `@Public()`, y comprueba el rol si llevan `@Roles`.
 * Solo actúa sobre HTTP; el canal de las PCs (WebSocket) tiene su propia identidad.
 */
@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, targets)) {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const token = request.cookies[STAFF_COOKIE];
    const session = token ? await this.auth.authenticate(token) : null;
    if (!token || !session) {
      throw new UnauthorizedException('Inicia sesión para continuar');
    }
    request.staff = session.staff;
    if (session.renewed) {
      // Se reenvía la cookie con la nueva caducidad (7 días renovables).
      http
        .getResponse<FastifyReply>()
        .setCookie(STAFF_COOKIE, token, staffCookieOptions(this.config, session.expiresAt));
    }

    const roles = this.reflector.getAllAndOverride<StaffRole[] | undefined>(ROLES, targets);
    if (roles && !roles.includes(session.staff.role)) {
      throw new ForbiddenException('No tienes permiso para esta acción');
    }
    return true;
  }
}
