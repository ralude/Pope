import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type NodeToPcMessage,
  type PcToNodeMessage,
  pcToNodeMessageSchema,
  type ProtocolErrorCode,
  requestIdSchema,
} from '@pope/shared';
import { eq } from 'drizzle-orm';

import { DATABASE, type Database } from '../db/database.js';
import { pcs } from '../db/schema.js';
import { type PcConnection, PcConnections, type PcIdentity } from './pc-connections.js';

type HelloMessage = Extract<PcToNodeMessage, { type: 'hello' }>;

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
    connection.send(await this.stateFor());
  }

  /** Mensajes de una PC ya identificada. */
  private async dispatch(
    connection: PcConnection,
    pc: PcIdentity,
    message: Exclude<PcToNodeMessage, HelloMessage>,
  ): Promise<void> {
    switch (message.type) {
      case 'heartbeat':
        connection.send(await this.stateFor());
        return;
      case 'login':
      case 'logout':
      case 'buyCombo':
        connection.send(
          protocolError('internal_error', 'Todavía no disponible', message.requestId),
        );
        return;
    }
  }

  /** Estado que debe mostrar la PC. Sin sesiones todavía, siempre bloqueada. */
  private stateFor(): Promise<NodeToPcMessage> {
    return Promise.resolve({ type: 'state', status: 'locked' });
  }
}
