import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type NodeToPcMessage,
  type NativePcToNodeMessage,
  nativePcToNodeMessageSchema,
  NATIVE_PC_PROTOCOL_VERSION,
  type ProtocolErrorCode,
  requestIdSchema,
} from '@pope/shared';

import { CombosService } from '../combos/combos.service.js';
import { Clock } from '../common/clock.js';
import { CustomerAuthService } from '../customers/customer-auth.service.js';
import { DATABASE, type Database } from '../db/database.js';
import { PcAuthenticationService } from '../pcs/pc-authentication.service.js';
import { type PcConnection, PcConnections, type PcIdentity } from './pc-connections.js';
import { PcCommandsService } from './pc-commands.service.js';
import { PcMaintenanceService } from './pc-maintenance.service.js';
import { TechnicalLoginService } from './technical-login.service.js';
import { PcWakeService } from './pc-wake.service.js';
import { PcControlService } from './pc-control.service.js';
import { PausesService } from './pauses.service.js';
import { customerInactiveMessage, PcRequestRefused } from './session-state.js';
import { PC_UNAVAILABLE_FOR_CUSTOMER, SessionsService } from './sessions.service.js';

type HelloMessage = Extract<NativePcToNodeMessage, { type: 'hello' }>;
type LoginMessage = Extract<NativePcToNodeMessage, { type: 'login' }>;

/** Mensaje de error del protocolo, con el `requestId` de la petición si lo traía. */
export function protocolError(
  code: ProtocolErrorCode,
  message: string,
  requestId?: string,
): NodeToPcMessage {
  return { type: 'error', code, message, ...(requestId !== undefined && { requestId }) };
}

/**
 * El `state` que responde a una petición (`buyCombo`, `pause`, `resume`) lleva su
 * `requestId`: así el Shell lo distingue de un `state` de latido que se cruce.
 */
function answering(state: NodeToPcMessage, requestId: string | undefined): NodeToPcMessage {
  return state.type === 'state' && state.status === 'active' && requestId !== undefined
    ? { ...state, requestId }
    : state;
}

/** `requestId` de un mensaje aunque no cumpla el protocolo, para poder responderle. */
function requestIdOf(data: unknown): string | undefined {
  if (typeof data === 'object' && data !== null && 'requestId' in data) {
    const parsed = requestIdSchema.safeParse(data.requestId);
    return parsed.success ? parsed.data : undefined;
  }
  return undefined;
}

/**
 * Protocolo PC ↔ nodo (plan 001, "Contratos"): valida cada mensaje con los esquemas de
 * `shared` y lo enruta por su `type` (ADR-0003). Lo primero que envía una PC es `hello`.
 */
@Injectable()
export class PcProtocolService {
  private readonly logger = new Logger('PcProtocol');

  constructor(
    private readonly connections: PcConnections,
    private readonly sessions: SessionsService,
    private readonly pauses: PausesService,
    private readonly customerAuth: CustomerAuthService,
    private readonly combos: CombosService,
    private readonly clock: Clock,
    private readonly authentication: PcAuthenticationService,
    private readonly control: PcControlService,
    private readonly commands: PcCommandsService,
    private readonly wakes: PcWakeService,
    private readonly maintenance: PcMaintenanceService,
    private readonly technicalLogin: TechnicalLoginService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  /** Procesa un mensaje en crudo. Nunca lanza: los fallos se responden con `error`. */
  async receive(connection: PcConnection, raw: string): Promise<void> {
    if (!(await this.authentication.current(connection.authentication))) {
      connection.send({
        type: 'pcAuthenticationError',
        code: 'pc_credential_revoked',
        message: 'Credencial de PC revocada',
      });
      connection.close(1008, 'Credencial de PC revocada');
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      connection.send(protocolError('invalid_message', 'Mensaje no válido'));
      return;
    }
    if (
      typeof data === 'object' &&
      data !== null &&
      'type' in data &&
      data.type === 'hello' &&
      (!('protocolVersion' in data) || data.protocolVersion !== NATIVE_PC_PROTOCOL_VERSION)
    ) {
      connection.send({
        type: 'pcAuthenticationError',
        code: 'unsupported_protocol_version',
        message: 'Versión del agente no admitida',
      });
      connection.close(1008, 'Versión no admitida');
      return;
    }
    const parsed = nativePcToNodeMessageSchema.safeParse(data);
    if (!parsed.success) {
      connection.send(protocolError('invalid_message', 'Mensaje no válido', requestIdOf(data)));
      return;
    }
    const message = parsed.data;
    try {
      if (message.type === 'hello') {
        await this.hello(connection, message);
      } else if (!connection.pc) {
        connection.send(
          protocolError('invalid_message', 'La PC debe identificarse antes', requestIdOf(message)),
        );
      } else {
        await this.dispatch(connection, connection.pc, message);
      }
    } catch (error) {
      if (error instanceof PcRequestRefused) {
        connection.send(protocolError(error.code, error.message, requestIdOf(message)));
        return;
      }
      this.logger.error(`Error con el mensaje ${message.type}`, error);
      connection.send(
        protocolError('internal_error', 'Error inesperado del nodo', requestIdOf(message)),
      );
    }
  }

  /** La conexión se cerró. */
  disconnected(connection: PcConnection): void {
    this.connections.unregister(connection);
  }

  /** La PC se identifica: se registra y recibe su estado actual. */
  private async hello(connection: PcConnection, message: HelloMessage): Promise<void> {
    const pc = connection.authentication.pc;
    if (pc.id !== message.pcId) {
      connection.send({
        type: 'pcAuthenticationError',
        code: 'pc_identity_mismatch',
        message: 'La identidad no coincide con la PC autorizada',
      });
      connection.close(1008, 'Identidad de PC no válida');
      return;
    }
    if (connection.pc) {
      connection.send(protocolError('invalid_message', 'hello ya recibido'));
      connection.close(1008, 'hello repetido');
      return;
    }
    // Antes de registrar la conexión: así el mapa que provoca ya no trae el aviso de encendido.
    await this.wakes.connected(pc.id);
    this.connections.register(pc, connection);
    if (message.recoveryState === 'known') await this.sessions.reconcile(pc.id, message);
    else this.sessions.touch(pc.id);
    connection.send(await this.sessions.stateFor(pc.id));
    // T35: mantenimiento abierto, o `null`; la PC lo guarda aparte del estado de sesión.
    connection.send({
      type: 'maintenanceState',
      maintenance: await this.maintenance.current(pc.id),
    });
    await this.control.sync(pc.id, message.controlContext);
    await this.commands.reconnected(pc.id);
  }

  /** Mensajes de una PC ya identificada. */
  private async dispatch(
    connection: PcConnection,
    pc: PcIdentity,
    message: Exclude<NativePcToNodeMessage, HelloMessage>,
  ): Promise<void> {
    // Cualquier mensaje prueba que la PC está viva: se puede cobrar hasta ahora.
    this.sessions.touch(pc.id);
    switch (message.type) {
      case 'heartbeat':
        connection.send(await this.sessions.heartbeat(pc.id, message));
        // El latido trae la copia del contexto de la PC: se corrige si cambió (T28).
        await this.control.sync(pc.id, message.controlContext);
        return;
      case 'login':
        connection.send(await this.login(pc, message));
        return;
      case 'logout':
        // Si cierra, `SessionsService` ya avisó a la PC con `sessionEnded`. Si no había
        // sesión, la PC tenía un dato viejo: se le dice cómo está de verdad.
        if (!(await this.sessions.logout(pc.id))) {
          connection.send(await this.sessions.stateFor(pc.id));
        }
        return;
      case 'buyCombo':
        connection.send(
          answering(await this.sessions.buyCombo(pc.id, message.comboId), message.requestId),
        );
        return;
      case 'pause':
        connection.send(answering(await this.pauses.pause(pc.id), message.requestId));
        return;
      case 'resume':
        connection.send(answering(await this.pauses.resume(pc.id), message.requestId));
        return;
      case 'listCombos':
        connection.send({
          type: 'combos',
          ...(message.requestId !== undefined && { requestId: message.requestId }),
          combos: await this.combos.forSale(),
        });
        return;
      case 'technicalLogin': {
        // La respuesta llega con el acuse de la orden, salvo un rechazo inmediato.
        const refused = await this.technicalLogin.login(pc, message);
        if (refused) connection.send(refused);
        return;
      }
      case 'commandAck':
        // Sin respuesta: la PC no espera nada y el panel lo verá en el estado de la orden.
        await this.commands.acknowledge(pc.id, message);
        return;
      default:
        // Las variantes de mantenimiento se activan en sus tareas posteriores.
        connection.send(
          protocolError('invalid_message', 'Operación aún no disponible', requestIdOf(message)),
        );
        return;
    }
  }

  /**
   * El cliente inicia sesión desde el Shell (REQ-001-20). Cada motivo de rechazo tiene su
   * mensaje (pregunta resuelta de la spec 001). Devuelve el `state` de la sesión abierta.
   */
  private async login(pc: PcIdentity, message: LoginMessage): Promise<NodeToPcMessage> {
    // Antes de comprobar la contraseña: así un intento en una PC ocupada no cuenta.
    if (await this.sessions.activeOnPc(pc.id)) {
      throw new PcRequestRefused('session_already_active', 'Esta PC ya tiene una sesión abierta');
    }
    if (await this.control.unavailableIn(this.db, pc.id)) {
      throw new PcRequestRefused('pc_unavailable', PC_UNAVAILABLE_FOR_CUSTOMER);
    }
    const result = await this.customerAuth.verify(message.username, message.password);
    if (!result.ok) {
      switch (result.reason) {
        case 'invalid_credentials':
          throw new PcRequestRefused('invalid_credentials', 'Usuario o contraseña incorrectos');
        case 'account_locked': {
          const minutes = Math.ceil(
            (result.lockedUntil.getTime() - this.clock.now().getTime()) / 60_000,
          );
          throw new PcRequestRefused(
            'account_locked',
            `Demasiados intentos fallidos. Prueba de nuevo en ${String(minutes)} min`,
          );
        }
        case 'account_inactive':
          throw new PcRequestRefused('account_inactive', customerInactiveMessage(result.status));
      }
    }
    return this.sessions.startAccountSession(pc, result.customer);
  }
}
