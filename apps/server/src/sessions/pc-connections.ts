import { Injectable, Logger } from '@nestjs/common';
import { type NodeToPcMessage, nodeToPcMessageSchema } from '@pope/shared';

/** PC identificada con `hello` (id y nombre de la tabla `pcs`). */
export interface PcIdentity {
  id: string;
  name: string;
}

/** Una conexión WebSocket de una PC, vista desde el dominio (sin detalles de `ws`). */
export interface PcConnection {
  /** PC identificada con `hello`; `null` hasta entonces. */
  pc: PcIdentity | null;
  send(message: NodeToPcMessage): void;
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

  /**
   * Envía un mensaje a la PC si está conectada; devuelve si se envió. Los mensajes se
   * validan con el protocolo antes de salir: un error aquí es un fallo del nodo.
   */
  send(pcId: string, message: NodeToPcMessage): boolean {
    const connection = this.byPc.get(pcId);
    if (!connection) {
      return false;
    }
    connection.send(nodeToPcMessageSchema.parse(message));
    return true;
  }
}
