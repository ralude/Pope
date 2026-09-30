import { Module } from '@nestjs/common';

import { PcConnections } from './pc-connections.js';
import { PcGateway } from './pc-gateway.js';
import { PcProtocolService } from './pc-protocol.service.js';

/**
 * Sesiones de uso de las PCs y el canal WebSocket por el que las PCs hablan con el nodo
 * (plan 001). El nodo decide; la PC solo muestra y obedece (ADR-0007).
 */
@Module({
  providers: [PcConnections, PcProtocolService, PcGateway],
  exports: [PcConnections],
})
export class SessionsModule {}
