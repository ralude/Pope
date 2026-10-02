import { Module } from '@nestjs/common';

import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module.js';
import { CashRegisterService } from './cash-register.service.js';
import { CashController } from './cash.controller.js';

/**
 * Registro de caja (spec 005, REQ-005-24): lo usan las ventas, las recargas, las sesiones
 * temporales y los combos cobrados en caja. `ShiftsModule` es global.
 */
@Module({
  imports: [ExchangeRatesModule],
  controllers: [CashController],
  providers: [CashRegisterService],
  exports: [CashRegisterService],
})
export class CashModule {}
