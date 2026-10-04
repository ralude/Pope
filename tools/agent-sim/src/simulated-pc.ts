// PC simulada: habla el protocolo del agente con el nodo local (plan 001, "Comportamiento del
// agente en el canal"). La usan la CLI del simulador y la prueba de carga; más adelante la
// sustituye el agente real de la spec 003.
import {
  devPcId,
  devPcName,
  type NodeToPcMessage,
  nodeToPcMessageSchema,
  PROTOCOL_VERSION,
  type SessionPause,
} from '@pope/shared';

/**
 * Lo mínimo que la PC necesita de una conexión WebSocket. El `WebSocket` global de Node 24
 * lo cumple; los tests usan una conexión falsa.
 */
export interface PcSocket {
  send(data: string): void;
  close(): void;
  onopen: ((...args: never[]) => void) | null;
  onmessage: ((...args: never[]) => void) | null;
  onclose: ((...args: never[]) => void) | null;
  onerror: ((...args: never[]) => void) | null;
}

/** Cómo se abre una conexión al nodo. */
export type PcConnector = (url: string) => PcSocket;

/** Espera entre reintentos de conexión: 1, 2, 4, 8, 16 y, como tope, 30 s. */
export const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 16_000, 30_000] as const;

/** Lo que le pasa a la PC, para que quien la use lo muestre o lo cuente. */
export type PcEvent =
  | { kind: 'connected' }
  | { kind: 'disconnected' }
  | { kind: 'message'; message: NodeToPcMessage }
  | { kind: 'invalid'; reason: string };

export interface SimulatedPcOptions {
  /** Número de la PC de ejemplo (1…99): "PC 05" es el 5. */
  number: number;
  /** URL del canal, p. ej. `ws://127.0.0.1:3000/pc`. */
  url: string;
  /** Cómo se abre la conexión; por defecto, el `WebSocket` global. */
  connect?: PcConnector;
  onEvent?: (event: PcEvent) => void;
  /** Cada cuánto late; 10 s como el agente real. */
  heartbeatMs?: number;
  /** Reloj de alta resolución en ms, para medir la latencia del login. */
  now?: () => number;
  /** Cuánto espera la respuesta a un login antes de darlo por perdido. */
  loginTimeoutMs?: number;
}

/** Resultado de un login: lo que contestó el nodo y cuánto tardó. */
export interface LoginResult {
  /** `state` activo si entró, o `error` con el motivo. */
  message: NodeToPcMessage;
  ok: boolean;
  /** Milisegundos entre enviar `login` y recibir la respuesta. */
  ms: number;
}

/** Foto de la PC en un momento. */
export interface PcSnapshot {
  number: number;
  name: string;
  connected: boolean;
  poweredOff: boolean;
  sessionId: string | null;
  /** Quién usa la PC: el usuario o el nombre de la sesión temporal. */
  who: string | null;
  localRemainingSeconds: number | null;
  /** Última pausa confirmada por el nodo; se conserva al perder la red. */
  pause: SessionPause | null;
}

interface PendingLogin {
  startedAt: number;
  resolve: (result: LoginResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class SimulatedPc {
  readonly name: string;
  private readonly pcId: string;
  private readonly connectFn: PcConnector;
  private readonly heartbeatMs: number;
  private readonly now: () => number;
  private readonly loginTimeoutMs: number;

  private socket: PcSocket | null = null;
  /** Conexión que quedó colgada por un apagón: no se cierra hasta volver la luz. */
  private zombie: PcSocket | null = null;
  private connected = false;
  private running = false;
  private poweredOff = false;
  /** Un corte de red en curso: no reconecta hasta que se cumpla su plazo. */
  private cut = false;

  private sessionId: string | null = null;
  private who: string | null = null;
  /** Restante que dijo el nodo y cuándo lo dijo: el local se calcula restando el tiempo pasado. */
  private remainingBase: number | null = null;
  private remainingSyncedAt = 0;
  private pauseState: SessionPause | null = null;

  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private cutTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pendingLogin: PendingLogin | null = null;

  constructor(private readonly options: SimulatedPcOptions) {
    this.name = devPcName(options.number);
    this.pcId = devPcId(options.number);
    this.connectFn = options.connect ?? ((url) => new WebSocket(url));
    this.heartbeatMs = options.heartbeatMs ?? 10_000;
    this.now = options.now ?? (() => performance.now());
    this.loginTimeoutMs = options.loginTimeoutMs ?? 30_000;
  }

  get number(): number {
    return this.options.number;
  }

  snapshot(): PcSnapshot {
    return {
      number: this.options.number,
      name: this.name,
      connected: this.connected,
      poweredOff: this.poweredOff,
      sessionId: this.sessionId,
      who: this.who,
      localRemainingSeconds: this.localRemaining,
      pause: this.pauseState,
    };
  }

  /** Enciende la PC: abre la conexión y manda `hello`. */
  start(): void {
    this.running = true;
    this.open();
  }

  /**
   * El cliente inicia sesión en el Shell. Devuelve lo que contesta el nodo (un `state` activo
   * o un `error`) y la latencia. Falla si la PC no está conectada o el nodo no contesta.
   */
  login(username: string, password: string): Promise<LoginResult> {
    if (!this.connected || this.pendingLogin) {
      return Promise.reject(
        new Error(this.connected ? 'Ya hay un login en curso' : 'La PC no está conectada'),
      );
    }
    return new Promise<LoginResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingLogin = null;
        reject(new Error('El nodo no contestó al login'));
      }, this.loginTimeoutMs);
      this.pendingLogin = { startedAt: this.now(), resolve, reject, timer };
      this.send({ type: 'login', username, password });
    });
  }

  /** El cliente cierra su sesión; el nodo contesta con `sessionEnded`. */
  logout(): void {
    this.send({ type: 'logout' });
  }

  /** Pide la pausa; la cuenta solo se detiene cuando el nodo la confirma. */
  pause(): void {
    this.send({ type: 'pause' });
  }

  /** Pide reanudar; conserva la pausa hasta recibir el nuevo `state` del nodo. */
  resume(): void {
    this.send({ type: 'resume' });
  }

  /**
   * Corte de red de `seconds` segundos: la PC pierde la conexión, sigue contando su restante
   * en local y, pasado el plazo, reconecta con la sesión y el restante que guarda.
   */
  networkCut(seconds: number): void {
    this.dropSocket();
    this.cut = true;
    this.clearTimer('cutTimer');
    this.cutTimer = setTimeout(() => {
      this.cutTimer = null;
      this.cut = false;
      this.attempt = 0;
      this.open();
    }, seconds * 1000);
  }

  /** Reinicio de la PC: pierde la sesión y vuelve a conectar sin ella (`sessionId: null`). */
  reboot(): void {
    this.dropSocket();
    this.forgetSession();
    this.cut = false;
    this.clearTimer('cutTimer');
    this.clearTimer('reconnectTimer');
    this.attempt = 0;
    this.open();
  }

  /**
   * Apagón de la PC: deja de latir y de reconectar. Como en un apagón de verdad, la conexión
   * no se cierra: el nodo se entera porque dejan de llegar latidos.
   */
  powerCut(): void {
    this.poweredOff = true;
    this.stopHeartbeat();
    this.clearTimer('reconnectTimer');
    this.clearTimer('cutTimer');
    this.cut = false;
    if (this.socket) {
      this.zombie?.close();
      this.zombie = this.socket;
      this.socket = null;
      this.connected = false;
    }
    this.failLogin('Se fue la luz');
    this.forgetSession();
    this.emit({ kind: 'disconnected' });
  }

  /** Vuelve la luz: la PC arranca como tras un reinicio, sin sesión. */
  powerOn(): void {
    this.poweredOff = false;
    this.attempt = 0;
    if (this.running) {
      this.open();
    }
  }

  /** Apaga el simulador de esta PC: cierra todo y cancela los temporizadores. */
  stop(): void {
    this.running = false;
    this.stopHeartbeat();
    this.clearTimer('reconnectTimer');
    this.clearTimer('cutTimer');
    this.failLogin('La PC se apagó');
    this.dropSocket();
    this.zombie?.close();
    this.zombie = null;
  }

  // ─── Conexión ────────────────────────────────────────────────────────────────────────

  private open(): void {
    if (!this.running || this.poweredOff) {
      return;
    }
    const socket = this.connectFn(this.options.url);
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) {
        return;
      }
      this.connected = true;
      this.attempt = 0;
      this.emit({ kind: 'connected' });
      this.send({
        type: 'hello',
        protocolVersion: PROTOCOL_VERSION,
        pcId: this.pcId,
        sessionId: this.sessionId,
        ...(this.sessionId !== null &&
          this.localRemaining !== null && { localRemainingSeconds: this.localRemaining }),
      });
      this.startHeartbeat();
      // Tras un apagón, la conexión vieja se cierra cuando la nueva ya está registrada.
      this.zombie?.close();
      this.zombie = null;
    };
    socket.onmessage = (event: { data: unknown }) => {
      if (this.socket === socket) {
        this.receive(event.data);
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      this.connected = false;
      this.stopHeartbeat();
      this.failLogin('Se perdió la conexión');
      this.emit({ kind: 'disconnected' });
      this.scheduleReconnect();
    };
  }

  /** Suelta la conexión actual sin que su cierre dispare un reintento. */
  private dropSocket(): void {
    const socket = this.socket;
    const wasConnected = this.connected;
    this.socket = null;
    this.connected = false;
    this.stopHeartbeat();
    this.failLogin('Se perdió la conexión');
    socket?.close();
    if (wasConnected) {
      this.emit({ kind: 'disconnected' });
    }
  }

  private scheduleReconnect(): void {
    if (!this.running || this.poweredOff || this.cut) {
      return;
    }
    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.attempt, RECONNECT_DELAYS_MS.length - 1)] ?? 30_000;
    this.attempt += 1;
    this.clearTimer('reconnectTimer');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({
        type: 'heartbeat',
        sessionId: this.sessionId,
        localRemainingSeconds: this.sessionId === null ? null : this.localRemaining,
      });
    }, this.heartbeatMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private send(message: object): void {
    if (this.connected && this.socket) {
      this.socket.send(JSON.stringify(message));
    }
  }

  // ─── Lo que llega del nodo ───────────────────────────────────────────────────────────

  private receive(data: unknown): void {
    if (typeof data !== 'string') {
      this.emit({ kind: 'invalid', reason: 'Mensaje que no es texto' });
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      this.emit({ kind: 'invalid', reason: 'Mensaje que no es JSON' });
      return;
    }
    const parsed = nodeToPcMessageSchema.safeParse(json);
    if (!parsed.success) {
      this.emit({ kind: 'invalid', reason: parsed.error.message });
      return;
    }
    const message = parsed.data;
    switch (message.type) {
      case 'state':
        if (message.status === 'active') {
          this.sessionId = message.session.sessionId;
          this.remainingBase = message.session.remainingSeconds;
          this.remainingSyncedAt = Date.now();
          this.pauseState =
            message.session.kind === 'account' ? (message.session.pause ?? null) : null;
          this.who =
            message.session.kind === 'account' ? message.session.username : message.session.name;
          this.resolveLogin({ message, ok: true });
        } else {
          this.forgetSession();
        }
        break;
      case 'sessionEnded':
        this.forgetSession();
        break;
      case 'error':
        this.resolveLogin({ message, ok: false });
        break;
      case 'warning':
        break;
    }
    this.emit({ kind: 'message', message });
  }

  private resolveLogin(result: { message: NodeToPcMessage; ok: boolean }): void {
    const pending = this.pendingLogin;
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    this.pendingLogin = null;
    pending.resolve({ ...result, ms: this.now() - pending.startedAt });
  }

  private failLogin(reason: string): void {
    const pending = this.pendingLogin;
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    this.pendingLogin = null;
    pending.reject(new Error(reason));
  }

  private forgetSession(): void {
    this.sessionId = null;
    this.who = null;
    this.remainingBase = null;
    this.pauseState = null;
  }

  /** Tiempo restante según la PC: lo que dijo el nodo menos los segundos que han pasado. */
  private get localRemaining(): number | null {
    if (this.remainingBase === null) {
      return null;
    }
    // El vencimiento y el cobro los decide el nodo, también durante un corte de red.
    if (this.pauseState && !this.pauseState.billing) {
      return this.remainingBase;
    }
    return Math.max(
      0,
      this.remainingBase - Math.floor((Date.now() - this.remainingSyncedAt) / 1000),
    );
  }

  private clearTimer(name: 'reconnectTimer' | 'cutTimer'): void {
    const timer = this[name];
    if (timer) {
      clearTimeout(timer);
      this[name] = null;
    }
  }

  private emit(event: PcEvent): void {
    this.options.onEvent?.(event);
  }
}
