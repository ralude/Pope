import { usd } from '@pope/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { devPcId } from '../pcs/dev-pcs.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { PanelClient } from '../testing/panel-client.js';
import { heartbeat, login, PcWorld } from '../testing/pc-world.js';

// Lunes 5 de octubre de 2026, 15:00 en Caracas.
const MONDAY = '2026-10-05T19:00:00Z';
const DAY = 24 * 60 * 60 * 1000;

describe('reparto de la tasa de cambio (e2e, spec 005, REQ-005-36, REQ-001-13)', () => {
  let world: PcWorld;
  let ana: string;

  beforeEach(async () => {
    world = await PcWorld.start(MONDAY);
    ana = await world.cashier();
  });

  afterEach(async () => {
    await world.close();
  });

  const setRate = (vesPerUsd: number) => world.api('POST', '/exchange-rate', ana, { vesPerUsd });

  const vesRateOf = (message: unknown) =>
    (message as { type: string; status: string; vesRate?: number | null }).vesRate;

  it('sin tasa, el state de la sesión no lleva ninguna', async () => {
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    const pc = await world.pc(5);
    expect(vesRateOf(await login(pc, 'juan'))).toBeNull();
  });

  it('al guardar una tasa, la PC con sesión recibe al momento un state con ella', async () => {
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    const pc = await world.pc(5);
    await login(pc, 'juan');

    expect((await setRate(40_000_000)).statusCode).toBe(201);
    expect(await pc.next()).toMatchObject({
      type: 'state',
      status: 'active',
      vesRate: 40_000_000,
      session: { kind: 'account', username: 'juan' },
    });
    // Y desde entonces, en cada latido.
    expect(vesRateOf(await heartbeat(pc))).toBe(40_000_000);
  });

  it('una sesión que empieza con tasa ya la trae, también la temporal', async () => {
    await setRate(40_000_000);
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    expect(vesRateOf(await login(await world.pc(5), 'juan'))).toBe(40_000_000);

    const pc6 = await world.pc(6);
    await world.api('POST', '/sessions/temporary', ana, {
      pcId: devPcId(6),
      minutes: 30,
      paymentMethod: 'cash_usd',
    });
    expect(vesRateOf(await pc6.next())).toBe(40_000_000);
  });

  it('el panel recibe la tasa al conectar y cada vez que cambia', async () => {
    const panel = PanelClient.connect(world.url.replace(/\/pc$/, '/panel'), ana);
    expect(await panel.nextRate()).toEqual({ rate: null, stale: false });

    await setRate(40_000_000);
    expect(await panel.nextRate()).toMatchObject({
      rate: { vesPerUsd: 40_000_000, source: 'manual', setBy: 'Ana' },
      stale: false,
    });
    panel.close();
  });

  it('al pasar los días, avisa al panel de que la tasa quedó desactualizada (REQ-005-35)', async () => {
    await setRate(40_000_000);
    const panel = PanelClient.connect(world.url.replace(/\/pc$/, '/panel'), ana);
    expect((await panel.nextRate()).stale).toBe(false);

    // Del lunes al miércoles, sin que nadie toque la tasa: la revisión de cada minuto lo ve.
    world.clock.advance(2 * DAY);
    await world.clock.tick(60_000);
    expect(await panel.nextRate()).toMatchObject({ stale: true });
    panel.close();
  });
});
