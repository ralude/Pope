import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { StaffAuthGuard } from './staff-auth.guard.js';
import { StaffService } from './staff.service.js';

/**
 * Personal del local y sus sesiones en el panel (REQ-001-40). Registra `StaffAuthGuard`
 * como guard global: todo endpoint HTTP exige sesión salvo los marcados con `@Public()`.
 */
@Module({
  controllers: [AuthController],
  providers: [
    PasswordService,
    StaffService,
    AuthService,
    { provide: APP_GUARD, useClass: StaffAuthGuard },
  ],
  exports: [PasswordService, StaffService, AuthService],
})
export class AuthModule {}
