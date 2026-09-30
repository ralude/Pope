import { Module } from '@nestjs/common';

import { TariffsModule } from '../tariffs/tariffs.module.js';
import { CombosController } from './combos.controller.js';
import { CombosService } from './combos.service.js';

/** Combos de horas (REQ-001-80, REQ-001-81, ADR-0014). */
@Module({
  imports: [TariffsModule],
  controllers: [CombosController],
  providers: [CombosService],
  exports: [CombosService],
})
export class CombosModule {}
