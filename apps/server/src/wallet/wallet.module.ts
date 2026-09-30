import { Module } from '@nestjs/common';

import { WalletService } from './wallet.service.js';

/** Saldos de las cuentas y su ledger (REQ-001-83, REQ-001-89, ADR-0014). */
@Module({
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
