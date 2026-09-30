import { newId, usd } from '@pope/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { sessions } from '../db/schema.js';
import { devPcId } from '../pcs/dev-pcs.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { activeSession, heartbeat, login, PcWorld, summary } from '../testing/pc-world.js';
import { WalletService } from '../wallet/wallet.service.js';

const MINUTE = 60_000;

// 18:00 en Caracas (UTC−4) de un lunes (1,50 USD/h) y de un jueves (2,00 USD/h).
const MONDAY = '2026-09-28T22:00:00Z';
const THURSDAY = '2026-10-01T22:00:00Z';
// 23:00 del miércoles en Caracas, para ver cómo cruza la medianoche.
const WEDNESDAY_NIGHT = '2026-10-01T03:00:00Z';

describe('latidos y checkpoint (e2e, REQ-001-11, REQ-001-12, REQ-001-23)', () => {
  let world: PcWorld;

  afterEach(async () => {
    await world.close();
  });

  /** Sesión guardada en la base de datos de la PC número `n`. */
  async function storedSession(n: number) {
    const [row] = await world.testApp.database.db
      .select()
      .from(sessions)
      .where(eq(sessions.pcId, devPcId(n)));
    if (!row) {
      throw new Error('La PC no tiene sesión');
    }
    return row;
  }

  it('CA-001-12: tras 30 min de uso, muestra 1:30:00 y 2,25 USD', async () => {
    world = await PcWorld.start(MONDAY);
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    const pc = await world.pc(5);
    await login(pc, 'juan');

    world.clock.advance(30 * MINUTE);
    expect(summary(await heartbeat(pc))).toEqual({
      remainingSeconds: 5400,
      money: usd(2.25),
      comboSeconds: 0,
      rate: usd(1.5),
    });
  });

  it('CA-001-16: gasta primero el combo y sigue con el dinero sin cortes', async () => {
    world = await PcWorld.start(THURSDAY);
    await createCustomerWithBalance(world.testApp, 'juan', {
      moneyMicros: usd(3),
      comboSeconds: 1800,
    });
    const pc = await world.pc(5);
    await login(pc, 'juan');

    world.clock.advance(30 * MINUTE);
    expect(summary(await heartbeat(pc))).toEqual({
      remainingSeconds: 5400,
      money: usd(3),
      comboSeconds: 0,
      rate: usd(2),
    });

    world.clock.advance(30 * MINUTE);
    expect(summary(await heartbeat(pc))).toEqual({
      remainingSeconds: 3600,
      money: usd(2),
      comboSeconds: 0,
      rate: usd(2),
    });
  });

  it('CA-001-19: al cruzar la medianoche sigue con la tarifa de cuando empezó', async () => {
    world = await PcWorld.start(WEDNESDAY_NIGHT);
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    const pc = await world.pc(5);
    expect(summary(await login(pc, 'juan')).rate).toBe(usd(1.5));

    // Son las 00:30 del jueves: la tarifa de hoy es 2,00 USD/h, pero la sesión no cambia.
    world.clock.advance(90 * MINUTE);
    expect(summary(await heartbeat(pc))).toEqual({
      remainingSeconds: 1800,
      money: usd(0.75),
      comboSeconds: 0,
      rate: usd(1.5),
    });
  });

  it('no pierde fracciones de segundo: el cobro no depende de cuántos latidos haya', async () => {
    world = await PcWorld.start(MONDAY);
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    const pc = await world.pc(5);
    await login(pc, 'juan');
    const started = (await storedSession(5)).startedAt;

    // Dos latidos a los 10,5 s y a los 21 s: en total se cobran 21 s exactos.
    world.clock.advance(10_500);
    await heartbeat(pc);
    expect((await storedSession(5)).moneySeconds).toBe(10);
    world.clock.advance(10_500);
    await heartbeat(pc);
    const row = await storedSession(5);
    expect(row.moneySeconds).toBe(21);
    expect(row.moneyChargedMicros).toBe(8750);
    expect(row.lastHeartbeatAt).toEqual(new Date(started.getTime() + 21_000));
  });

  it('el saldo nunca queda negativo si el latido llega muy tarde', async () => {
    world = await PcWorld.start(MONDAY);
    const juan = await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    const pc = await world.pc(5);
    await login(pc, 'juan');

    // Pasan 3 h con solo 2 h pagadas: se cobra lo que había y la sesión se cierra.
    world.clock.advance(3 * 60 * MINUTE);
    expect(await heartbeat(pc)).toMatchObject({ type: 'sessionEnded', reason: 'exhausted' });
    expect((await storedSession(5)).moneySeconds).toBe(7200);
    expect(await world.testApp.app.get(WalletService).balances(juan.id)).toEqual({
      moneyMicros: 0,
      comboSeconds: 0,
    });
  });

  it('un reloj que retrocede no cobra ni mueve la marca', async () => {
    world = await PcWorld.start(MONDAY);
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    const pc = await world.pc(5);
    await login(pc, 'juan');
    const before = await storedSession(5);

    world.clock.advance(-5 * MINUTE);
    expect(summary(await heartbeat(pc)).remainingSeconds).toBe(7200);
    expect((await storedSession(5)).lastHeartbeatAt).toEqual(before.lastHeartbeatAt);
  });

  it('una PC sin sesión recibe la pantalla de bloqueo', async () => {
    world = await PcWorld.start(MONDAY);
    expect(await heartbeat(await world.pc(5))).toEqual({ type: 'state', status: 'locked' });
  });

  it('REQ-001-63: una sesión temporal guarda su tiempo restante en cada latido', async () => {
    world = await PcWorld.start(MONDAY);
    const id = newId();
    await world.testApp.database.db.insert(sessions).values({
      id,
      pcId: devPcId(5),
      kind: 'temporary',
      tempName: 'Temporal · PC 05 · 18:00',
      rateMicrosPerHour: usd(1.5),
      startedAt: world.clock.now(),
      lastHeartbeatAt: world.clock.now(),
      openedBy: { kind: 'system' },
      purchasedSeconds: 3600,
    });
    const pc = await world.pc(5, id);

    world.clock.advance(20 * MINUTE);
    const session = activeSession(await heartbeat(pc));
    expect(session).toMatchObject({ kind: 'temporary', purchasedSeconds: 3600 });
    expect(session.remainingSeconds).toBe(2400);
    expect((await storedSession(5)).usedSeconds).toBe(1200);

    // Más tiempo del comprado no se usa: se agota y la sesión se cierra.
    world.clock.advance(60 * MINUTE);
    expect(await heartbeat(pc)).toMatchObject({ type: 'sessionEnded', reason: 'exhausted' });
    expect(await storedSession(5)).toMatchObject({ status: 'ended', usedSeconds: 3600 });
  });
});
