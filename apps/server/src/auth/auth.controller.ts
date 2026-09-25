import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { type StaffLoginRequest, staffLoginRequestSchema, type StaffProfile } from '@pope/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { AuthService } from './auth.service.js';
import { CurrentStaff, Public } from './decorators.js';
import { STAFF_COOKIE, staffCookieOptions } from './staff-cookie.js';

/** Login y logout del personal en el panel (REQ-001-40). */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Comprueba usuario y contraseña y deja la sesión en una cookie httpOnly. */
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(staffLoginRequestSchema)) body: StaffLoginRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StaffProfile> {
    const login = await this.auth.login(body.username, body.password);
    if (!login) {
      // No se dice si falló el usuario, la contraseña o si la cuenta está desactivada.
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }
    reply.setCookie(STAFF_COOKIE, login.token, staffCookieOptions(this.config, login.expiresAt));
    return login.staff;
  }

  /** Cierra la sesión de esta cookie y la borra. Sin sesión no hace nada. */
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const token = request.cookies[STAFF_COOKIE];
    if (token) {
      await this.auth.logout(token);
    }
    reply.clearCookie(STAFF_COOKIE, { path: '/' });
  }

  /** Quién ha iniciado sesión: lo usa el panel al cargar. */
  @Get('me')
  me(@CurrentStaff() staff: StaffProfile): StaffProfile {
    return staff;
  }
}
