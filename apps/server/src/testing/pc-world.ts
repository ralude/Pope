import type { NodeToPcMessage, TemporarySession } from '@pope/shared';

import { devPcId, seedDevPcs } from '../pcs/dev-pcs.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { createTestApp, type TestApp } from './app.js';
import { loginAsStaff } from './auth.js';
import { FakeClock } from './clock.js';
import { listenForPcs, PcTestClient } from './pc-client.js';
import { NO_OPENING_CASH } from './shifts.js';

/**
 * Nodo de test para las sesiones: reloj simulado en la hora indicada, las PCs de ejemplo
 * ("PC 01" … "PC 10") y el canal WebSocket abierto. Cierra las PCs conectadas y la app en
 * `close()`.
 */
export class PcWorld {
  private readonly clients: PcTestClient[] = [];

  private constructor(
    readonly testApp: TestApp,
    readonly clock: FakeClock,
    readonly url: string,
  ) {}

  static async start(at: string): Promise<PcWorld> {
    const clock = new FakeClock(at);
    const testApp = await createTestApp('local', [], { clock });
    await seedDevPcs(testApp.database.db);
    return new PcWorld(testApp, clock, await listenForPcs(testApp));
  }

  /**
   * Conecta la PC número `n` ("PC 0n") y descarta su primer `state`. `sessionId` es la
   * sesión que la PC dice tener: al reconectar en mitad de una sesión hay que indicarla, o
   * el nodo entiende que la PC se reinició y la cierra.
   */
  async pc(n: number, sessionId: string | null = null): Promise<PcTestClient> {
    const { pc } = await PcTestClient.hello(this.url, devPcId(n), sessionId);
    this.clients.push(pc);
    return pc;
  }

  /**
   * Deja pasar `ms` de tiempo simulado con la PC número `n` latiendo cada `every` ms (10 s,
   * como el agente real), para que las sesiones largas no se cierren por falta de latidos.
   * Cada latido nombra la sesión activa, como hace el agente. Los avisos y cierres que
   * ocurran llegan a la PC conectada.
   */
  async run(n: number, ms: number, every = 10_000): Promise<void> {
    const sessions = this.testApp.app.get(SessionsService);
    for (let left = ms; left > 0; left -= every) {
      await this.clock.tick(Math.min(every, left));
      const active = await sessions.activeOnPc(devPcId(n));
      await sessions.heartbeat(devPcId(n), { sessionId: active?.id ?? null });
    }
  }

  async close(): Promise<void> {
    for (const client of this.clients.splice(0)) {
      client.close();
    }
    await this.testApp.close();
  }

  /** Petición HTTP al nodo, con la cookie del personal si se indica. */
  api(method: 'GET' | 'POST' | 'PUT', url: string, cookie: string | null, payload?: object) {
    return this.testApp.app.inject({
      method,
      url,
      headers: cookie ? { cookie } : {},
      ...(payload && { payload }),
    });
  }

  /** Un encargado con sesión iniciada y el turno de caja abierto; devuelve su cookie. */
  async cashier(username = 'ana', displayName = 'Ana'): Promise<string> {
    const cookie = await loginAsStaff(this.testApp, username, 'encargado', displayName);
    await this.api('POST', '/shifts', cookie, NO_OPENING_CASH);
    return cookie;
  }

  /**
   * El encargado abre una sesión temporal de `minutes` minutos en la PC `n`, que se conecta
   * antes. Devuelve la PC (ya sin el `state` de desbloqueo en su cola) y la sesión.
   */
  async openTemporary(
    cookie: string,
    n: number,
    minutes: number,
    name?: string,
  ): Promise<{ pc: PcTestClient; session: TemporarySession }> {
    const pc = await this.pc(n);
    const response = await this.api('POST', '/sessions/temporary', cookie, {
      pcId: devPcId(n),
      paymentMethod: 'cash_usd',
      minutes,
      ...(name !== undefined && { name }),
    });
    if (response.statusCode !== 201) {
      throw new Error(`No se pudo abrir la sesión temporal: ${response.body}`);
    }
    await pc.next();
    return { pc, session: response.json<TemporarySession>() };
  }
}

/** El cliente de la PC inicia sesión; devuelve la respuesta del nodo. */
export function login(
  client: PcTestClient,
  username: string,
  password = '1234',
): Promise<NodeToPcMessage> {
  return client.request({ type: 'login', username, password, requestId: 'login-1' });
}

/** El cliente compra un combo con su saldo desde el Shell; devuelve la respuesta del nodo. */
export function buyCombo(client: PcTestClient, comboId: string): Promise<NodeToPcMessage> {
  return client.request({ type: 'buyCombo', comboId, requestId: 'buy-1' });
}

/** El Shell pide los combos a la venta; devuelve la respuesta del nodo. */
export function listCombos(client: PcTestClient): Promise<NodeToPcMessage> {
  return client.request({ type: 'listCombos', requestId: 'combos-1' });
}

/** El cliente cierra su sesión desde el Shell; devuelve la respuesta del nodo. */
export function logout(client: PcTestClient): Promise<NodeToPcMessage> {
  return client.request({ type: 'logout', requestId: 'logout-1' });
}

/** Latido de la PC sin copia local del tiempo; devuelve la respuesta del nodo. */
export function heartbeat(client: PcTestClient): Promise<NodeToPcMessage> {
  return client.request({ type: 'heartbeat', sessionId: null, localRemainingSeconds: null });
}

/** La sesión de un `state` activo; falla si la PC está bloqueada o el mensaje es otro. */
export function activeSession(message: NodeToPcMessage) {
  if (message.type !== 'state' || message.status !== 'active') {
    throw new Error(`Se esperaba un state activo: ${JSON.stringify(message)}`);
  }
  return message.session;
}

/** Resumen del `state` de una sesión con cuenta: tiempo total, saldo, combo y tarifa. */
export function summary(message: NodeToPcMessage) {
  const session = activeSession(message);
  if (session.kind !== 'account') {
    throw new Error('Se esperaba una sesión con cuenta');
  }
  const { remainingSeconds, money, comboSeconds, ratePerHour } = session;
  return { remainingSeconds, money: money.micros, comboSeconds, rate: ratePerHour.micros };
}
