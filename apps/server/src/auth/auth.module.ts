import { Module } from '@nestjs/common';

import { PasswordService } from './password.service.js';
import { StaffService } from './staff.service.js';

/** Personal del local (REQ-001-40). */
@Module({
  providers: [PasswordService, StaffService],
  exports: [PasswordService, StaffService],
})
export class AuthModule {}
