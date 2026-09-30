import { Module } from '@nestjs/common';

import { WalletController } from './wallet.controller.js';
import { WalletService } from './wallet.service.js';

/** Saldos de las cuentas y su ledger (REQ-001-83, REQ-001-89, ADR-0014). */
@Module({
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
