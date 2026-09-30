import { hours, newId, usd } from '@pope/shared';
import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CombosService } from '../combos/combos.service.js';
import { CustomersService } from '../customers/customers.service.js';
import { events, ledger, sessions } from '../db/schema.js';
import { devPcId } from '../pcs/dev-pcs.js';
import { loginAsStaff } from '../testing/auth.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import {
  activeSession,
  buyCombo,
  heartbeat,
  login,
  logout,
  PcWorld,
  summary,
} from '../testing/pc-world.js';
import { assertBalancesMatchLedger } from '../testing/wallet.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
// 18:00 en Caracas de un lunes: 1,50 USD/h.
const MONDAY = '2026-09-28T22:00:00Z';
const SYSTEM = { kind: 'system' } as const;

describe('compra de combos desde el Shell (e2e, REQ-001-85, REQ-001-82)', () => {
  let world: PcWorld;
  let combo20: string;

  beforeEach(async () => {
    world = await PcWorld.start(MONDAY);
    const combo = await world.testApp.app
      .get(CombosService)
      .create({ name: 'Combo 20 horas', priceMicros: usd(20), seconds: hours(20) }, SYSTEM);
    combo20 = combo.id;
  });

  afterEach(async () => {
    await world.close();
  });

  async function lastEvent() {
    const all = await world.testApp.database.db.select().from(events).orderBy(asc(events.seq));
    return all.at(-1);
  }

  async function consumption() {
    const rows = await world.testApp.database.db.select().from(ledger);
    return rows
      .filter((row) => row.kind === 'consumption')
      .map(({ wallet, amount }) => ({ wallet, amount }));
  }

  it('CA-001-17: con 25 USD compra el combo de 20 h y le quedan 5 USD y 20:00:00', async () => {
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(25) });
    const pc = await world.pc(5);
    const { sessionId } = activeSession(await login(pc, 'juan'));

    const state = await buyCombo(pc, combo20);

    expect(summary(state)).toEqual({
      remainingSeconds: hours(20) + 12_000,
      money: usd(5),
      comboSeconds: hours(20),
      rate: usd(1.5),
    });
    expect(await lastEvent()).toMatchObject({
      type: 'combo.purchased',
      actor: { kind: 'customer', username: 'juan' },
      payload: { combo: { name: 'Combo 20 horas' }, payment: { via: 'balance' }, sessionId },
    });
    const rows = await world.testApp.database.db
      .select()
      .from(ledger)
      .where(eq(ledger.kind, 'combo_purchase'));
    expect(rows.filter((row) => row.sessionId === sessionId)).toHaveLength(2);
    await assertBalancesMatchLedger(world.testApp.database.db);
  });

  it('cobra la sesión hasta ese instante y desde entonces gasta las horas del combo', async () => {
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(25) });
    const pc = await world.pc(5);
    await login(pc, 'juan');

    // A los 30 min ya lleva 0,75 USD consumidos; el combo se paga con lo que queda.
    world.clock.advance(30 * MINUTE);
    expect(summary(await buyCombo(pc, combo20))).toMatchObject({
      money: usd(4.25),
      comboSeconds: hours(20),
    });

    // Otra hora de uso sale del combo: el dinero no se toca.
    world.clock.advance(60 * MINUTE);
    expect(summary(await heartbeat(pc))).toMatchObject({
      money: usd(4.25),
      comboSeconds: hours(20) - 3600,
    });

    // Al cerrar se liquida cada monedero una vez y los saldos cuadran con el ledger.
    await logout(pc);
    expect(await consumption()).toEqual([
      { wallet: 'combo', amount: -3600 },
      { wallet: 'money', amount: usd(-0.75) },
    ]);
    await assertBalancesMatchLedger(world.testApp.database.db);
  });

  it('no gasta en el combo dinero que la sesión ya consumió, aunque la cuenta lo tenga', async () => {
    const juan = await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(21) });
    const pc = await world.pc(5);
    await login(pc, 'juan');

    // Tras 1 h lleva 1,50 USD consumidos: en la cuenta hay 21 USD, pero en vivo solo 19,50.
    world.clock.advance(60 * MINUTE);
    expect(await buyCombo(pc, combo20)).toEqual({
      type: 'error',
      code: 'insufficient_balance',
      message: 'No tienes saldo suficiente para este combo. Recarga en el mostrador',
      requestId: 'buy-1',
    });
    expect(summary(await heartbeat(pc))).toMatchObject({ money: usd(19.5), comboSeconds: 0 });
    expect((await lastEvent())?.type).toBe('session.started');

    // El encargado tampoco puede desde el panel.
    const ana = await loginAsStaff(world.testApp, 'ana', 'encargado', 'Ana');
    const response = await world.testApp.app.inject({
      method: 'POST',
      url: `/customers/${juan.id}/combo-purchases`,
      headers: { cookie: ana },
      payload: { comboId: combo20, payment: { via: 'balance' } },
    });
    expect(response.statusCode).toBe(409);
  });

  it('una venta desde el panel cobra antes la sesión en curso y la PC ve el nuevo saldo', async () => {
    const juan = await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(25) });
    const pc = await world.pc(5);
    await login(pc, 'juan');
    // 10 min de uso con latidos; el último latido llegó hace 8 s (la PC sigue viva).
    await world.run(5, 10 * MINUTE, MINUTE);
    world.clock.advance(8 * SECOND);

    const ana = await loginAsStaff(world.testApp, 'ana', 'encargado', 'Ana');
    const response = await world.testApp.app.inject({
      method: 'POST',
      url: `/customers/${juan.id}/combo-purchases`,
      headers: { cookie: ana },
      payload: { comboId: combo20, payment: { via: 'balance' } },
    });
    expect(response.statusCode).toBe(201);

    // Los 608 s previos a la compra salen del dinero (0,2533 USD), no de las horas nuevas.
    expect(summary(await pc.next())).toMatchObject({
      money: usd(25 - 20) - 253_333,
      comboSeconds: hours(20),
    });
    await logout(pc);
    expect(await consumption()).toEqual([{ wallet: 'money', amount: -253_333 }]);
  });

  it('avisa otra vez si con el combo vuelve a tener más de 5 min y luego se acerca al final', async () => {
    const cheap = await world.testApp.app
      .get(CombosService)
      .create({ name: 'Combo de 1 hora', priceMicros: usd(0.1), seconds: hours(1) }, SYSTEM);
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(0.4) });
    const pc = await world.pc(5);
    const { sessionId } = activeSession(await login(pc, 'juan'));

    // 0,40 USD son 960 s. A los 700 s quedan 260: toca el aviso de 5 min.
    world.clock.advance(700 * SECOND);
    expect(await heartbeat(pc)).toEqual({ type: 'warning', sessionId, minutesLeft: 5 });
    await pc.next();

    // El combo de 1 h le devuelve tiempo: 3600 s de combo más 20 s del dinero que sobra.
    expect(summary(await buyCombo(pc, cheap.id)).remainingSeconds).toBe(3620);

    // Cuando otra vez le quedan 250 s, el aviso de 5 min se repite.
    world.clock.advance(3370 * SECOND);
    expect(await heartbeat(pc)).toEqual({ type: 'warning', sessionId, minutesLeft: 5 });
    expect(summary(await pc.next()).remainingSeconds).toBe(250);
  });

  it('cada motivo de rechazo tiene su código y su mensaje', async () => {
    const juan = await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(25) });
    const pc = await world.pc(5);
    const pc6 = await world.pc(6);

    expect(await buyCombo(pc, combo20)).toMatchObject({
      code: 'no_active_session',
      message: 'No tienes una sesión abierta',
    });

    await login(pc, 'juan');
    expect(await buyCombo(pc, newId())).toMatchObject({
      code: 'combo_unavailable',
      message: 'Ese combo ya no está a la venta',
    });
    await world.testApp.app.get(CombosService).update(combo20, { active: false }, SYSTEM);
    expect(await buyCombo(pc, combo20)).toMatchObject({ code: 'combo_unavailable' });
    await world.testApp.app.get(CombosService).update(combo20, { active: true }, SYSTEM);

    await world.testApp.app.get(CustomersService).setStatus(juan.id, 'blocked', SYSTEM);
    expect(await buyCombo(pc, combo20)).toMatchObject({
      code: 'account_inactive',
      message: 'Tu cuenta está bloqueada. Habla con el encargado',
    });

    // Una sesión temporal no puede comprar combos.
    const tempId = newId();
    await world.testApp.database.db.insert(sessions).values({
      id: tempId,
      pcId: devPcId(6),
      kind: 'temporary',
      tempName: 'Temporal · PC 06 · 18:00',
      rateMicrosPerHour: usd(1.5),
      startedAt: world.clock.now(),
      lastHeartbeatAt: world.clock.now(),
      openedBy: SYSTEM,
      purchasedSeconds: 3600,
    });
    expect(await buyCombo(pc6, combo20)).toMatchObject({
      code: 'no_active_session',
      message: 'Los combos son solo para clientes con cuenta',
    });
  });
});
