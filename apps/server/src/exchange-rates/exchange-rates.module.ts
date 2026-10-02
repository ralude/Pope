import { Module } from '@nestjs/common';

import { ExchangeRatesController } from './exchange-rates.controller.js';
import { ExchangeRatesService } from './exchange-rates.service.js';

/** Tasa de cambio USD → VES (spec 005, parte 1: tasa manual). */
@Module({
  controllers: [ExchangeRatesController],
  providers: [ExchangeRatesService],
  exports: [ExchangeRatesService],
})
export class ExchangeRatesModule {}
