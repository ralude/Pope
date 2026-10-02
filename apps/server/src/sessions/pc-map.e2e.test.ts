import { devPcId, PANEL_UNAUTHORIZED_CLOSE, type PcMap, usd } from '@pope/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PANEL_INTERRUPTED_CHECK_MS } from './panel-hub.js';
import { PcConnections } from './pc-connections.js';
import { loginAsStaff } from '../testing/auth.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { PanelClient } from '../testing/panel-client.js';
import { login, PcWorld } from '../testing/pc-world.js';

// 18:00 en Caracas de un lunes: 1,50 USD/h.
const MONDAY = '2026-09-28T22:00:00Z';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

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
    const juan = await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
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
        customerId: juan.id,
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
        customerId: null,
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

    const first = await panel.nextMap();
    expect(pcIn(first, 5)).toMatchObject({ connected: true, session: null });

    await login(pc, 'juan');
    await world.clock.tick(1000);
    const update = await panel.nextMap();
    expect(pcIn(update, 5).session).toMatchObject({ kind: 'account', who: 'juan' });
    panel.close();
  });

  it('una PC que se desconecta también llega en vivo', async () => {
    const pc = await world.pc(7);
    const panel = PanelClient.connect(panelUrl, ana);
    expect(pcIn(await panel.nextMap(), 7).connected).toBe(true);

    pc.close();
    await pc.closed;
    const connections = world.testApp.app.get(PcConnections);
    await vi.waitFor(() => {
      expect(connections.isConnected(devPcId(7))).toBe(false);
    });
    await world.clock.tick(1000);
    expect(pcIn(await panel.nextMap(), 7).connected).toBe(false);
    panel.close();
  });

  it('avisa de las interrumpidas pendientes al conectar y cuando cambian (T45, REQ-001-66)', async () => {
    const panel = PanelClient.connect(panelUrl, ana);
    expect(await panel.nextPending()).toBe(0);

    // "Carlos" paga 60 min, la usa 20 y se va la luz: a los 3 min sin latidos se cierra.
    const { pc } = await world.openTemporary(ana, 5, 60, 'Carlos');
    await world.run(5, 20 * MINUTE, MINUTE);
    pc.close();
    await pc.closed;
    await world.clock.tick(4 * MINUTE);
    expect(await panel.nextPending()).toBe(1);

    // A las 48 h del corte caduca sin ningún evento: lo ve la revisión de cada minuto.
    world.clock.advance(48 * HOUR);
    await world.clock.tick(PANEL_INTERRUPTED_CHECK_MS);
    expect(await panel.nextPending()).toBe(0);
    panel.close();
  });

  it('sin una sesión del personal válida, el canal se cierra', async () => {
    expect(await PanelClient.connect(panelUrl).closed).toBe(PANEL_UNAUTHORIZED_CLOSE);
    expect(await PanelClient.connect(panelUrl, 'pope_staff_session=inventada').closed).toBe(
      PANEL_UNAUTHORIZED_CLOSE,
    );
  });
});
