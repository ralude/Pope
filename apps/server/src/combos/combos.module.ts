import { Module } from '@nestjs/common';

import { TariffsModule } from '../tariffs/tariffs.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { ComboSalesService } from './combo-sales.service.js';
import { CombosController } from './combos.controller.js';
import { CombosService } from './combos.service.js';

/**
 * Combos de horas y su venta (REQ-001-80 a REQ-001-85, ADR-0014). El endpoint de venta
 * desde el panel está en `SessionsModule`, porque antes de vender cobra la sesión en curso.
 */
@Module({
  imports: [TariffsModule, WalletModule],
  controllers: [CombosController],
  providers: [CombosService, ComboSalesService],
  exports: [CombosService, ComboSalesService],
})
export class CombosModule {}
