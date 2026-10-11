import { Module } from '@nestjs/common';

import { PcRegistrationController } from './pc-registration.controller.js';
import { PcRegistrationService } from './pc-registration.service.js';
import { PcAuthenticationService } from './pc-authentication.service.js';

@Module({
  controllers: [PcRegistrationController],
  providers: [PcRegistrationService, PcAuthenticationService],
  exports: [PcRegistrationService, PcAuthenticationService],
})
export class PcsModule {}
