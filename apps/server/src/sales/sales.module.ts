import { Module } from '@nestjs/common';

import { CashModule } from '../cash/cash.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { SalesController } from './sales.controller.js';
import { SalesService } from './sales.service.js';

/** Ventas del mostrador: golosinas y otros ingresos (spec 005, REQ-005-05, REQ-005-20). */
@Module({
  imports: [CashModule, SettingsModule, WalletModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
