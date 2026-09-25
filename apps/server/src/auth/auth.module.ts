import { Module } from '@nestjs/common';

import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { StaffService } from './staff.service.js';

/** Personal del local y sus sesiones en el panel (REQ-001-40). */
@Module({
  providers: [PasswordService, StaffService, AuthService],
  exports: [PasswordService, StaffService, AuthService],
})
export class AuthModule {}
