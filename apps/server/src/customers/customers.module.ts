import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CustomerAuthService } from './customer-auth.service.js';
import { CustomersController } from './customers.controller.js';
import { CustomersService } from './customers.service.js';

/** Cuentas de cliente (REQ-001-01 a REQ-001-04) y sus credenciales (REQ-001-51, REQ-001-52). */
@Module({
  imports: [AuthModule],
  controllers: [CustomersController],
  providers: [CustomersService, CustomerAuthService],
  exports: [CustomersService, CustomerAuthService],
})
export class CustomersModule {}
