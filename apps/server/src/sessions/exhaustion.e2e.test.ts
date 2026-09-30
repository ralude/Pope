import { newId, usd } from '@pope/shared';
import { asc, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { events, ledger, sessions } from '../db/schema.js';
import { devPcId } from '../pcs/dev-pcs.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { heartbeat, login, PcWorld, summary } from '../testing/pc-world.js';
import { assertBalancesMatchLedger } from '../testing/wallet.js';
import { WalletService } from '../wallet/wallet.service.js';
import { PcConnections } from './pc-connections.js';

const MINUTE = 60_000;
// 18:00 en Caracas de un lunes: 1,50 USD/h, así que 3,00 USD son 2 h justas.
const MONDAY = '2026-09-28T22:00:00Z';
// Los temporizadores saltan 20 ms después del instante justo: los tests avanzan un poco más.
const MARGIN = 100;

describe('avisos y agotamiento (e2e, REQ-001-24, REQ-001-25, REQ-001-62)', () => {
  let world: PcWorld;

  afterEach(async () => {
    await world.close();
  });

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

  async function recharge(customerId: string, moneyMicros: number) {
    await world.testApp.database.db.transaction((tx) =>
      world.testApp.app.get(WalletService).post(tx, {
        customerId,
        wallet: 'money',
        amount: moneyMicros,
        kind: 'recharge',
        actor: { kind: 'system' },
      }),
    );
  }

  /** Sesión temporal de 1 h en la PC 5, sin pasar por el panel (llega en la T31). */
  async function insertTemporary() {
    await world.testApp.database.db.insert(sessions).values({
      id: newId(),
      pcId: devPcId(5),
      kind: 'temporary',
      tempName: 'Temporal · PC 05 · 18:00',
      rateMicrosPerHour: usd(1.5),
      startedAt: world.clock.now(),
      lastHeartbeatAt: world.clock.now(),
      openedBy: { kind: 'system' },
      purchasedSeconds: 3600,
    });
  }

  it('avisa a los 5 y 1 min y cierra al agotarse, cada cosa en su instante', async () => {
    world = await PcWorld.start(MONDAY);
    const juan = await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    const pc = await world.pc(5);
    await login(pc, 'juan');
    const { id } = await storedSession(5);
    const started = world.clock.now();

    // Sin ningún latido de la PC: solo los temporizadores del nodo.
    await world.clock.tick(115 * MINUTE + MARGIN);
    expect(await pc.next()).toEqual({ type: 'warning', sessionId: id, minutesLeft: 5 });
    await world.clock.tick(4 * MINUTE + MARGIN);
    expect(await pc.next()).toEqual({ type: 'warning', sessionId: id, minutesLeft: 1 });
    await world.clock.tick(MINUTE + MARGIN);
    expect(await pc.next()).toEqual({ type: 'sessionEnded', sessionId: id, reason: 'exhausted' });

    // Se cobró exactamente lo que había y no queda saldo negativo.
    const all = await world.testApp.database.db.select().from(events).orderBy(asc(events.seq));
    expect(all.at(-1)).toMatchObject({
      type: 'session.ended',
      actor: { kind: 'system' },
      payload: {
        reason: 'exhausted',
        billedUntil: new Date(started.getTime() + 120 * MINUTE).toISOString(),
        usage: { kind: 'account', moneySeconds: 7200, moneyCharged: { micros: usd(3) } },
      },
    });
    expect(await world.testApp.app.get(WalletService).balances(juan.id)).toEqual({
      moneyMicros: 0,
      comboSeconds: 0,
    });
    await assertBalancesMatchLedger(world.testApp.database.db);
    expect(await world.testApp.database.db.select().from(ledger)).toHaveLength(2);
    expect(await storedSession(5)).toMatchObject({ status: 'ended', endReason: 'exhausted' });
  });

  it('con 3 min de saldo, el aviso de 5 min sale al empezar y el de 1 min al llegar', async () => {
    world = await PcWorld.start(MONDAY);
    // 0,075 USD a 1,50 USD/h son 180 s.
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(0.075) });
    const pc = await world.pc(5);
    expect(summary(await login(pc, 'juan')).remainingSeconds).toBe(180);
    const { id } = await storedSession(5);

    await world.clock.tick(MARGIN);
    expect(await pc.next()).toEqual({ type: 'warning', sessionId: id, minutesLeft: 5 });
    await world.clock.tick(2 * MINUTE);
    expect(await pc.next()).toEqual({ type: 'warning', sessionId: id, minutesLeft: 1 });
    await world.clock.tick(MINUTE);
    expect(await pc.next()).toMatchObject({ type: 'sessionEnded', reason: 'exhausted' });
  });

  it('el latido también avisa, una sola vez por umbral', async () => {
    world = await PcWorld.start(MONDAY);
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    const pc = await world.pc(5);
    await login(pc, 'juan');
    const { id } = await storedSession(5);

    // Salto de reloj: quedan 250 s, sin que haya saltado ningún temporizador.
    world.clock.advance(6950_000);
    expect(await heartbeat(pc)).toEqual({ type: 'warning', sessionId: id, minutesLeft: 5 });
    expect(summary(await pc.next()).remainingSeconds).toBe(250);
    expect(summary(await heartbeat(pc)).remainingSeconds).toBe(250);
  });

  it('si compra tiempo, el cierre programado no salta y los avisos se rearman', async () => {
    world = await PcWorld.start(MONDAY);
    const juan = await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    const pc = await world.pc(5);
    await login(pc, 'juan');
    await world.clock.tick(119 * MINUTE + MARGIN);
    expect(await pc.next()).toMatchObject({ type: 'warning', minutesLeft: 5 });
    expect(await pc.next()).toMatchObject({ type: 'warning', minutesLeft: 1 });

    // A 1 min del final, recarga 1,50 USD (1 h más): el cierre previsto ya no toca.
    await recharge(juan.id, usd(1.5));
    await world.clock.tick(2 * MINUTE);
    expect(summary(await heartbeat(pc)).remainingSeconds).toBe(3540);

    // Al volver a quedar 5 min, el aviso se repite.
    await world.clock.tick(3240_000 + MARGIN);
    expect(await pc.next()).toMatchObject({ type: 'warning', minutesLeft: 5 });
  });

  it('una sesión temporal avisa y se cierra al agotar el tiempo pagado (REQ-001-62)', async () => {
    world = await PcWorld.start(MONDAY);
    await insertTemporary();
    const pc = await world.pc(5);
    const { id } = await storedSession(5);
    await heartbeat(pc);

    await world.clock.tick(55 * MINUTE + MARGIN);
    expect(await pc.next()).toEqual({ type: 'warning', sessionId: id, minutesLeft: 5 });
    await world.clock.tick(4 * MINUTE);
    expect(await pc.next()).toEqual({ type: 'warning', sessionId: id, minutesLeft: 1 });
    await world.clock.tick(MINUTE);
    expect(await pc.next()).toEqual({ type: 'sessionEnded', sessionId: id, reason: 'exhausted' });
    expect(await storedSession(5)).toMatchObject({ status: 'ended', usedSeconds: 3600 });
  });

  it('un aviso que no se pudo entregar se envía cuando la PC vuelve', async () => {
    world = await PcWorld.start(MONDAY);
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    const pc = await world.pc(5);
    await login(pc, 'juan');
    const { id } = await storedSession(5);
    world.clock.advance(114 * MINUTE);
    await heartbeat(pc);

    // La PC se desconecta justo cuando toca el aviso de 5 min.
    pc.close();
    await pc.closed;
    const connections = world.testApp.app.get(PcConnections);
    await vi.waitFor(() => {
      expect(connections.isConnected(devPcId(5))).toBe(false);
    });
    await world.clock.tick(MINUTE + MARGIN);

    const back = await world.pc(5);
    expect(await heartbeat(back)).toEqual({ type: 'warning', sessionId: id, minutesLeft: 5 });
    expect(summary(await back.next()).remainingSeconds).toBe(300);
  });
});
