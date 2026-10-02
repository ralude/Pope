import {
  devPcId,
  PANEL_UNAUTHORIZED_CLOSE,
  type PanelMessage,
  panelMessageSchema,
  type PcMap,
  usd,
} from '@pope/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { PcConnections } from './pc-connections.js';
import { loginAsStaff } from '../testing/auth.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { login, PcWorld } from '../testing/pc-world.js';

// 18:00 en Caracas de un lunes: 1,50 USD/h.
const MONDAY = '2026-09-28T22:00:00Z';

/** Panel conectado al canal en vivo: guarda los mensajes y el cierre. */
class PanelClient {
  private readonly inbox: PanelMessage[] = [];
  private waiting: ((message: PanelMessage) => void) | null = null;
  readonly closed: Promise<number>;

  constructor(private readonly ws: WebSocket) {
    ws.on('message', (data: Buffer) => {
      const message = panelMessageSchema.parse(JSON.parse(data.toString('utf8')));
      if (this.waiting) {
        this.waiting(message);
        this.waiting = null;
      } else {
        this.inbox.push(message);
      }
    });
    this.closed = new Promise((resolve) => {
      ws.on('close', (code: number) => {
        resolve(code);
      });
    });
  }

  static connect(url: string, cookie?: string): PanelClient {
    return new PanelClient(new WebSocket(url, { headers: cookie ? { cookie } : {} }));
  }

  next(): Promise<PanelMessage> {
    const queued = this.inbox.shift();
    if (queued) {
      return Promise.resolve(queued);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting = null;
        reject(new Error('El panel no recibió nada en 5 s'));
      }, 5000);
      this.waiting = (message) => {
        clearTimeout(timer);
        resolve(message);
      };
    });
  }

  close(): void {
    this.ws.close();
  }
}

describe('estado de las PCs para el panel (e2e, REQ-001-31)', () => {
  let world: PcWorld;
  let ana: string;
  let panelUrl: string;

  beforeEach(async () => {
    world = await PcWorld.start(MONDAY);
    ana = await world.cashier();
    panelUrl = world.url.replace(/\/pc$/, '/panel');
  });

  afterEach(async () => {
    await world.close();
  });

  const pcIn = (map: PcMap, n: number) => {
    const pc = map.pcs.find((p) => p.id === devPcId(n));
    if (!pc) throw new Error(`Falta la PC ${String(n)}`);
    return pc;
  };

  it('el mapa refleja PCs con cuenta, temporales, libres y sin conexión', async () => {
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    await login(await world.pc(5), 'juan');
    await world.openTemporary(ana, 6, 30);
    await world.pc(7);

    const response = await world.api('GET', '/pcs/map', ana);
    expect(response.statusCode).toBe(200);
    const map = response.json<PcMap>();

    expect(map.pcs).toHaveLength(10);
    expect(map.pcs.map((p) => p.name)).toEqual(map.pcs.map((p) => p.name).sort());
    expect(pcIn(map, 5)).toMatchObject({
      name: 'PC 05',
      row: null,
      col: null,
      connected: true,
      session: {
        kind: 'account',
        who: 'juan',
        openedBy: 'juan',
        remainingSeconds: 7200,
        rateMicrosPerHour: usd(1.5),
        amountMicros: usd(3),
        comboSeconds: 0,
        ending: false,
        startedAt: '2026-09-28T22:00:00.000Z',
      },
    });
    expect(pcIn(map, 6)).toMatchObject({
      connected: true,
      session: {
        kind: 'temporary',
        who: 'Temporal · PC 06 · 18:00',
        openedBy: 'Ana',
        remainingSeconds: 1800,
        amountMicros: usd(0.75),
      },
    });
    expect(pcIn(map, 7)).toMatchObject({ connected: true, session: null });
    expect(pcIn(map, 8)).toMatchObject({ connected: false, session: null });
  });

  it('marca las sesiones a las que les quedan 5 min o menos', async () => {
    // 0,075 USD a 1,50 USD/h son 180 s.
    await createCustomerWithBalance(world.testApp, 'poco', { moneyMicros: usd(0.075) });
    await login(await world.pc(5), 'poco');
    const map = (await world.api('GET', '/pcs/map', ana)).json<PcMap>();
    expect(pcIn(map, 5).session).toMatchObject({ remainingSeconds: 180, ending: true });
  });

  it('lo consulta todo el personal, también el dueño, pero no sin sesión', async () => {
    const owner = await loginAsStaff(world.testApp, 'duena', 'dueno');
    expect((await world.api('GET', '/pcs/map', owner)).statusCode).toBe(200);
    expect((await world.api('GET', '/pcs/map', null)).statusCode).toBe(401);
  });

  it('el canal envía el mapa al conectar y un login desde la PC llega en vivo', async () => {
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    const pc = await world.pc(5);
    const panel = PanelClient.connect(panelUrl, ana);

    const first = await panel.next();
    expect(pcIn(first.map, 5)).toMatchObject({ connected: true, session: null });

    await login(pc, 'juan');
    await world.clock.tick(1000);
    const update = await panel.next();
    expect(pcIn(update.map, 5).session).toMatchObject({ kind: 'account', who: 'juan' });
    panel.close();
  });

  it('una PC que se desconecta también llega en vivo', async () => {
    const pc = await world.pc(7);
    const panel = PanelClient.connect(panelUrl, ana);
    expect(pcIn((await panel.next()).map, 7).connected).toBe(true);

    pc.close();
    await pc.closed;
    const connections = world.testApp.app.get(PcConnections);
    await vi.waitFor(() => {
      expect(connections.isConnected(devPcId(7))).toBe(false);
    });
    await world.clock.tick(1000);
    expect(pcIn((await panel.next()).map, 7).connected).toBe(false);
    panel.close();
  });

  it('sin una sesión del personal válida, el canal se cierra', async () => {
    expect(await PanelClient.connect(panelUrl).closed).toBe(PANEL_UNAUTHORIZED_CLOSE);
    expect(await PanelClient.connect(panelUrl, 'pope_staff_session=inventada').closed).toBe(
      PANEL_UNAUTHORIZED_CLOSE,
    );
  });
});
