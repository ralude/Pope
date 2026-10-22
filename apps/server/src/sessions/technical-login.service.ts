import { Inject, Injectable } from '@nestjs/common';
import {
  type NativeNodeToPcMessage,
  newId,
  type TechnicalLoginMessage,
  type TechnicalErrorMessage,
} from '@pope/shared';

import { TechnicalAuthService } from '../auth/technical-auth.service.js';
import { DATABASE, type Database } from '../db/database.js';
import { EventsService } from '../events/events.service.js';
import { PcCommandsService } from './pc-commands.service.js';
import type { PcIdentity } from './pc-connections.js';
import { PcControlService } from './pc-control.service.js';
import { PcMaintenanceService } from './pc-maintenance.service.js';
import { SessionsService } from './sessions.service.js';

/** Un rechazo con su código y texto para el Shell; deshace la transacción en curso. */
class TechnicalRefused extends Error {
  constructor(
    readonly code: TechnicalErrorMessage['code'],
    message: string,
  ) {
    super(message);
  }
}

const SESSION_OPEN = 'Cierra antes la sesión del cliente';
const IN_MAINTENANCE = 'La PC ya está en mantenimiento';
const ORDER_IN_PROGRESS = 'La PC tiene una orden del encargado en curso';

const AUTH_MESSAGES = {
  invalid_credentials: 'Usuario o contraseña incorrectos',
  staff_inactive: 'Tu usuario está desactivado',
  forbidden: 'Solo el encargado o el administrador pueden entrar en mantenimiento',
} as const;

/**
 * Entrada en mantenimiento pedida desde la PC con usuario y contraseña del personal (spec 003,
 * T35c; REQ-003-40). El nodo valida, y si la PC está libre guarda y envía una orden
 * `startMaintenance`; la entrada solo se registra cuando la PC la confirma (T35b). La
 * respuesta al Shell (`maintenanceState` o `technicalError`) llega con ese acuse.
 */
@Injectable()
export class TechnicalLoginService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly technicalAuth: TechnicalAuthService,
    private readonly control: PcControlService,
    private readonly commands: PcCommandsService,
    private readonly maintenance: PcMaintenanceService,
    private readonly sessions: SessionsService,
  ) {}

  /** Devuelve el error para el Shell, o `null` si la orden quedó enviada a la PC. */
  async login(
    pc: PcIdentity,
    message: TechnicalLoginMessage,
  ): Promise<NativeNodeToPcMessage | null> {
    const refuse = (code: TechnicalErrorMessage['code'], text: string): NativeNodeToPcMessage => ({
      type: 'technicalError',
      requestId: message.requestId,
      code,
      message: text,
    });
    // Antes de comprobar la contraseña: así un intento en una PC ocupada no cuenta (T36).
    const busy = await this.busy(pc.id);
    if (busy) return refuse('pc_unavailable', busy);

    const auth = await this.technicalAuth.verify(message.username, message.password);
    if (!auth.ok) return refuse(auth.reason, AUTH_MESSAGES[auth.reason]);

    try {
      const row = await this.events.inTransaction(async (tx, emit) => {
        const locked = await this.control.lockPc(tx, pc.id);
        if (!locked) throw new TechnicalRefused('pc_unavailable', ORDER_IN_PROGRESS);
        const context = await this.control.contextIn(tx, pc.id);
        // Repite la comprobación con la PC bloqueada: un login de cliente pudo adelantarse.
        if (context.kind === 'session') throw new TechnicalRefused('pc_unavailable', SESSION_OPEN);
        if (context.kind === 'maintenance') {
          throw new TechnicalRefused('pc_unavailable', IN_MAINTENANCE);
        }
        if (await this.control.unavailableIn(tx, pc.id)) {
          throw new TechnicalRefused('pc_unavailable', ORDER_IN_PROGRESS);
        }
        return this.commands.insertIn(tx, emit, {
          pc: locked,
          actor: { kind: 'staff', staffId: auth.staff.id, name: auth.staff.displayName },
          request: { id: newId(), kind: 'startMaintenance', expected: context },
          action: { kind: 'startMaintenance', maintenanceId: newId(), source: 'local' },
          context,
        });
      });
      this.maintenance.remember(row.id, message.requestId);
      this.commands.dispatch(row);
      return null;
    } catch (error) {
      if (error instanceof TechnicalRefused) return refuse(error.code, error.message);
      throw error;
    }
  }

  /** Por qué la PC no admite entrar ahora, o `null` si está libre. */
  private async busy(pcId: string): Promise<string | null> {
    if (await this.sessions.activeOnPc(pcId)) return SESSION_OPEN;
    const reason = await this.control.unavailableIn(this.db, pcId);
    if (reason === 'maintenance') return IN_MAINTENANCE;
    return reason ? ORDER_IN_PROGRESS : null;
  }
}
