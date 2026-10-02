import { Module } from '@nestjs/common';

import { CashModule } from '../cash/cash.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { SaleConceptsController } from './sale-concepts.controller.js';
import { SaleConceptsService } from './sale-concepts.service.js';
import { SalesController } from './sales.controller.js';
import { SalesService } from './sales.service.js';

/** Ventas del mostrador y sus conceptos sin inventario (spec 005, REQ-005-05, REQ-005-20). */
@Module({
  imports: [CashModule, SettingsModule, WalletModule],
  controllers: [SaleConceptsController, SalesController],
  providers: [SaleConceptsService, SalesService],
  exports: [SaleConceptsService, SalesService],
})
export class SalesModule {}
