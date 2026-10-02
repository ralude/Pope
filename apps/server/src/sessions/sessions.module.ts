import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CombosModule } from '../combos/combos.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { TariffsModule } from '../tariffs/tariffs.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { ComboSalesController } from './combo-sales.controller.js';
import { PanelHub } from './panel-hub.js';
import { PcConnections } from './pc-connections.js';
import { PcMapController } from './pc-map.controller.js';
import { PcMapService } from './pc-map.service.js';
import { PcGateway } from './pc-gateway.js';
import { PcProtocolService } from './pc-protocol.service.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';
import { StaleSessionsJob } from './stale-sessions.job.js';
import { TemporaryBackupController } from './temporary-backup.controller.js';
import { TemporarySessionsController } from './temporary-sessions.controller.js';
import { TemporarySessionsService } from './temporary-sessions.service.js';

/**
 * Sesiones de uso de las PCs y el canal WebSocket por el que las PCs hablan con el nodo
 * (plan 001). El nodo decide; la PC solo muestra y obedece (ADR-0007).
 */
@Module({
  imports: [AuthModule, CombosModule, CustomersModule, SettingsModule, TariffsModule, WalletModule],
  controllers: [
    SessionsController,
    TemporarySessionsController,
    TemporaryBackupController,
    ComboSalesController,
    PcMapController,
  ],
  providers: [
    PcConnections,
    PcMapService,
    PanelHub,
    SessionsService,
    TemporarySessionsService,
    StaleSessionsJob,
    PcProtocolService,
    PcGateway,
  ],
  exports: [PcConnections, SessionsService, TemporarySessionsService],
})
export class SessionsModule {}
