import { Module } from '@nestjs/common';

import { TariffsController } from './tariffs.controller.js';
import { TariffsService } from './tariffs.service.js';

/** Tarifa semanal por día (REQ-001-10, REQ-001-15, REQ-001-16). */
@Module({
  controllers: [TariffsController],
  providers: [TariffsService],
  exports: [TariffsService],
})
export class TariffsModule {}
