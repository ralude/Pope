import { Injectable, Logger } from '@nestjs/common';
import { type NativeNodeToPcMessage, nativeNodeToPcMessageSchema } from '@pope/shared';

import type { AuthenticatedPc } from '../pcs/pc-authentication.service.js';

/** PC identificada con `hello` (id y nombre de la tabla `pcs`). */
export interface PcIdentity {
  id: string;
  name: string;
}

/** Una conexión WebSocket de una PC, vista desde el dominio (sin detalles de `ws`). */
export interface PcConnection {
  /** Identidad fija comprobada antes del upgrade; no contiene el secreto. */
  readonly authentication: AuthenticatedPc;
  /** PC identificada con `hello`; `null` hasta entonces. */
  pc: PcIdentity | null;
  send(message: NativeNodeToPcMessage): void;
  close(code: number, reason: string): void;
}

/**
 * PCs conectadas ahora mismo, por id. Permite enviar a una PC desde cualquier parte del
 * nodo (p. ej. el panel abre una sesión temporal y la PC se desbloquea al momento).
 */
@Injectable()
export class PcConnections {
  private readonly logger = new Logger('PcConnections');
  private readonly byPc = new Map<string, PcConnection>();
  private readonly listeners = new Set<() => void>();
  /** PCs con una sesión retenida por revocación y esa sesión (T34, REQ-003-11). */
  private readonly held = new Map<string, string>();

  /** La PC tiene una sesión retenida: no se le envía estado activo ni avisos hasta soltarla. */
  hold(pcId: string, sessionId: string): void {
    this.held.set(pcId, sessionId);
  }

  /** Termina la retención de la PC (se autorizó continuar o se cerró la sesión). */
  release(pcId: string): void {
    this.held.delete(pcId);
  }

  /** Avisa cuando una PC se conecta o se desconecta (el mapa del panel). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private changed(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /** Registra la conexión de una PC; si ya tenía otra, la cierra (se quedó colgada). */
  register(pc: PcIdentity, connection: PcConnection): void {
    const previous = this.byPc.get(pc.id);
    if (previous && previous !== connection) {
      previous.pc = null;
      previous.close(4000, 'Otra conexión de esta PC la reemplaza');
    }
    connection.pc = pc;
    this.byPc.set(pc.id, connection);
    this.logger.log(`${pc.name} conectada`);
    this.changed();
  }

  /** Olvida la conexión si sigue siendo la registrada para su PC. */
  unregister(connection: PcConnection): void {
    const pc = connection.pc;
    if (pc && this.byPc.get(pc.id) === connection) {
      this.byPc.delete(pc.id);
      this.logger.log(`${pc.name} desconectada`);
      this.changed();
    }
  }

  isConnected(pcId: string): boolean {
    return this.byPc.has(pcId);
  }

  /** Envía el mismo mensaje a todas las PCs conectadas ahora mismo (p. ej. el fondo nuevo). */
  broadcast(message: NativeNodeToPcMessage): void {
    for (const pcId of this.byPc.keys()) {
      this.send(pcId, message);
    }
  }

  /**
   * Envía un mensaje a la PC si está conectada; devuelve si se envió. Los mensajes se
   * validan con el protocolo antes de salir: un error aquí es un fallo del nodo.
   */
  send(pcId: string, message: NativeNodeToPcMessage): boolean {
    const connection = this.byPc.get(pcId);
    if (!connection) {
      return false;
    }
    // Último recurso: ningún camino del nodo puede desbloquear una PC con la sesión retenida.
    const held = this.held.get(pcId);
    if (held !== undefined) {
      if (message.type === 'warning') return false;
      if (message.type === 'state' && message.status === 'active') {
        message = { type: 'state', status: 'held', sessionId: held, reason: 'credential_revoked' };
      }
    }
    connection.send(nativeNodeToPcMessageSchema.parse(message));
    return true;
  }
}
