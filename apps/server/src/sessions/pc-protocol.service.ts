import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type NodeToPcMessage,
  type PcToNodeMessage,
  pcToNodeMessageSchema,
  type ProtocolErrorCode,
  requestIdSchema,
} from '@pope/shared';
import { eq } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { CustomerAuthService } from '../customers/customer-auth.service.js';
import { DATABASE, type Database } from '../db/database.js';
import { pcs } from '../db/schema.js';
import { type PcConnection, PcConnections, type PcIdentity } from './pc-connections.js';
import { PcRequestRefused } from './session-state.js';
import { SessionsService } from './sessions.service.js';

type HelloMessage = Extract<PcToNodeMessage, { type: 'hello' }>;
type LoginMessage = Extract<PcToNodeMessage, { type: 'login' }>;

/** Mensaje de error del protocolo, con el `requestId` de la petición si lo traía. */
export function protocolError(
  code: ProtocolErrorCode,
  message: string,
  requestId?: string,
): NodeToPcMessage {
  return { type: 'error', code, message, ...(requestId !== undefined && { requestId }) };
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
    @Inject(DATABASE) private readonly db: Database,
    private readonly connections: PcConnections,
    private readonly sessions: SessionsService,
    private readonly customerAuth: CustomerAuthService,
    private readonly clock: Clock,
  ) {}

  /** Procesa un mensaje en crudo. Nunca lanza: los fallos se responden con `error`. */
  async receive(connection: PcConnection, raw: string): Promise<void> {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      connection.send(protocolError('invalid_message', 'Mensaje no válido'));
      return;
    }
    const parsed = pcToNodeMessageSchema.safeParse(data);
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
    const [pc] = await this.db
      .select({ id: pcs.id, name: pcs.name })
      .from(pcs)
      .where(eq(pcs.id, message.pcId));
    if (!pc) {
      connection.send(protocolError('unknown_pc', 'Esta PC no está registrada en el nodo'));
      connection.close(1008, 'PC desconocida');
      return;
    }
    this.connections.register(pc, connection);
    connection.send(await this.sessions.stateFor(pc.id));
  }

  /** Mensajes de una PC ya identificada. */
  private async dispatch(
    connection: PcConnection,
    pc: PcIdentity,
    message: Exclude<PcToNodeMessage, HelloMessage>,
  ): Promise<void> {
    switch (message.type) {
      case 'heartbeat':
        connection.send(await this.sessions.stateFor(pc.id));
        return;
      case 'login':
        connection.send(await this.login(pc, message));
        return;
      case 'logout':
      case 'buyCombo':
        connection.send(
          protocolError('internal_error', 'Todavía no disponible', message.requestId),
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
          throw new PcRequestRefused(
            'account_inactive',
            `Tu cuenta está ${result.status === 'blocked' ? 'bloqueada' : 'desactivada'}. Habla con el encargado`,
          );
      }
    }
    return this.sessions.startAccountSession(pc, result.customer);
  }
}
