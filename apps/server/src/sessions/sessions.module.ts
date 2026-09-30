import { Module } from '@nestjs/common';

import { CustomersModule } from '../customers/customers.module.js';
import { TariffsModule } from '../tariffs/tariffs.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { PcConnections } from './pc-connections.js';
import { PcGateway } from './pc-gateway.js';
import { PcProtocolService } from './pc-protocol.service.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';

/**
 * Sesiones de uso de las PCs y el canal WebSocket por el que las PCs hablan con el nodo
 * (plan 001). El nodo decide; la PC solo muestra y obedece (ADR-0007).
 */
@Module({
  imports: [CustomersModule, TariffsModule, WalletModule],
  controllers: [SessionsController],
  providers: [PcConnections, SessionsService, PcProtocolService, PcGateway],
  exports: [PcConnections, SessionsService],
})
export class SessionsModule {}
