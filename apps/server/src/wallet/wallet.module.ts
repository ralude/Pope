import { Module } from '@nestjs/common';

import { CashModule } from '../cash/cash.module.js';
import { WalletController } from './wallet.controller.js';
import { WalletService } from './wallet.service.js';

/** Saldos de las cuentas y su ledger (REQ-001-83, REQ-001-89, ADR-0014). */
@Module({
  imports: [CashModule],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
