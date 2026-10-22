// Canal del Shell con el nodo (T46). Las pantallas solo ven esta interfaz, que tendrá dos
// implementaciones: WebSocket directo al nodo en desarrollo (`dev-socket.ts`) y el puente de
// WebView2 con la spec 003, donde la conexión la mantiene el agente (REQ-003-63). Así el paso
// a la spec 003 no toca las pantallas.
import {
  maintenanceStateMessageSchema,
  type NativeShellNotification,
  type NativeShellRequest,
  type NodeToPcMessage,
  nodeToPcMessageSchema,
  type PcToNodeMessage,
  technicalErrorMessageSchema,
  type TechnicalLoginMessage,
} from '@pope/shared';

/** Salida del mantenimiento pedida en la PC: la atiende el agente, nunca el nodo (T40). */
export type EndMaintenanceRequest = Extract<NativeShellRequest, { type: 'endMaintenance' }>;

/**
 * Peticiones que hace el Shell. `hello` y los latidos son cosa del agente. El login técnico lleva
 * usuario y contraseña del personal; nunca una credencial de Windows (REQ-003-40).
 */
export type ShellRequest =
  | Extract<
      PcToNodeMessage,
      { type: 'login' | 'logout' | 'buyCombo' | 'listCombos' | 'pause' | 'resume' }
    >
  | TechnicalLoginMessage
  | EndMaintenanceRequest;

/** Mantenimiento de la PC y error del login técnico (T35, T38). */
export type MaintenanceMessage = Extract<
  NativeShellNotification,
  { type: 'maintenanceState' | 'technicalError' }
>;

/** Lo que el Shell recibe del nodo: el protocolo de sesión y el del mantenimiento. */
export type ShellMessage = NodeToPcMessage | MaintenanceMessage;

/** Un mensaje de la interfaz, o `null` si no es de las pantallas del Shell. */
export function parseShellMessage(value: unknown): ShellMessage | null {
  const session = nodeToPcMessageSchema.safeParse(value);
  if (session.success) return session.data;
  const maintenance = maintenanceStateMessageSchema.safeParse(value);
  if (maintenance.success) return maintenance.data;
  const technical = technicalErrorMessageSchema.safeParse(value);
  return technical.success ? technical.data : null;
}

/**
 * `connecting`: aún no hay respuesta del nodo; `online`: el nodo ya contestó con el estado de
 * la PC; `offline`: se perdió la conexión y se está reintentando.
 */
export type ChannelStatus = 'connecting' | 'online' | 'offline';

export type ChannelEvent =
  | { kind: 'status'; status: ChannelStatus; pcName?: string }
  | { kind: 'message'; message: ShellMessage; elapsedSeconds?: number };

export interface PcChannel {
  /** Empieza a conectar y avisa de cada cambio. Reintenta solo hasta `stop()`. */
  start(listener: (event: ChannelEvent) => void): void;
  stop(): void;
  /** Envía una petición al nodo. `false` si ahora mismo no hay conexión. */
  send(request: ShellRequest): boolean;
}
