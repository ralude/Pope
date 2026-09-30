import { newId, usd } from '@pope/shared';
import { asc, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { events, ledger, sessions } from '../db/schema.js';
import { devPcId } from '../pcs/dev-pcs.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { PcTestClient } from '../testing/pc-client.js';
import { activeSession, heartbeat, login, PcWorld } from '../testing/pc-world.js';
import { assertBalancesMatchLedger } from '../testing/wallet.js';
import { StaleSessionsJob } from './stale-sessions.job.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
// 18:00 en Caracas de un lunes: 1,50 USD/h.
const MONDAY = '2026-09-28T22:00:00Z';

describe('cierre sin latidos (e2e, REQ-001-27, REQ-001-66)', () => {
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

  async function allEvents() {
    return world.testApp.database.db.select().from(events).orderBy(asc(events.seq));
  }

  async function consumption() {
    const rows = await world.testApp.database.db.select().from(ledger);
    return rows
      .filter((row) => row.kind === 'consumption')
      .map(({ wallet, amount }) => ({ wallet, amount }));
  }

  /**
   * La PC reconecta diciendo que tiene la sesión `sessionId`, que el nodo ya cerró: recibe
   * `sessionEnded` y `state` bloqueado, y se devuelve con la cola vacía.
   */
  async function reconnect(pcNumber: number, sessionId: string): Promise<PcTestClient> {
    const { pc } = await PcTestClient.hello(world.url, devPcId(pcNumber), sessionId);
    await pc.next();
    return pc;
  }

  /** Latido con el restante local de la PC; devuelve lo que el nodo dice de la sesión. */
  async function beatWith(pc: PcTestClient, sessionId: string, localRemainingSeconds: number) {
    pc.send({ type: 'heartbeat', sessionId, localRemainingSeconds });
    const answer = await pc.next();
    await pc.next();
    return answer;
  }

  /** Sesión temporal de 1 h en la PC 5, sin pasar por el panel (llega en la T31). */
  async function insertTemporary(pcNumber = 5, restoredFrom: string | null = null) {
    const id = newId();
    await world.testApp.database.db.insert(sessions).values({
      id,
      pcId: devPcId(pcNumber),
      kind: 'temporary',
      tempName: 'Temporal · PC 05 · 18:00',
      rateMicrosPerHour: usd(1.5),
      startedAt: world.clock.now(),
      lastHeartbeatAt: world.clock.now(),
      openedBy: { kind: 'system' },
      purchasedSeconds: 3600,
      restoredFrom,
    });
    return id;
  }

  it('CA-001-03: sin latidos durante 3 min se cierra y se cobra solo hasta el último latido', async () => {
    world = await PcWorld.start(MONDAY);
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(0.4) });
    const pc = await world.pc(5);
    const { sessionId } = activeSession(await login(pc, 'juan'));

    // 10 min con latidos: sigue abierta. Después la PC se queda muda (se va la luz).
    await world.run(5, 10 * MINUTE, MINUTE);
    expect(await storedSession(5)).toMatchObject({ status: 'active' });
    const lastBeat = world.clock.now();

    // A 2 min 50 s sin latidos todavía no se cierra; a los 3 min sí. Entre medias salta el
    // temporizador del aviso de 5 min, y como la PC calla no debe cobrar el hueco.
    await world.clock.tick(2 * MINUTE + 50 * SECOND);
    expect(await storedSession(5)).toMatchObject({ status: 'active' });
    await world.clock.tick(10 * SECOND);

    expect(await pc.next()).toEqual({ type: 'sessionEnded', sessionId, reason: 'no_heartbeat' });
    expect(await storedSession(5)).toMatchObject({ status: 'ended', endReason: 'no_heartbeat' });
    // 10 min a 1,50 USD/h = 0,25 USD: el hueco de 3 min no se cobra.
    expect(await consumption()).toEqual([{ wallet: 'money', amount: usd(-0.25) }]);
    await assertBalancesMatchLedger(world.testApp.database.db);
    expect((await allEvents()).at(-1)).toMatchObject({
      type: 'session.ended',
      actor: { kind: 'system' },
      payload: {
        reason: 'no_heartbeat',
        billedUntil: lastBeat.toISOString(),
        usage: { kind: 'account', moneySeconds: 600 },
      },
    });
  });

  it('una sesión temporal cerrada sin latidos conserva su tiempo restante', async () => {
    world = await PcWorld.start(MONDAY);
    const id = await insertTemporary();
    const pc = await world.pc(5, id);
    await heartbeat(pc);
    await world.run(5, 10 * MINUTE, MINUTE);

    await world.clock.tick(3 * MINUTE);
    expect(await pc.next()).toEqual({
      type: 'sessionEnded',
      sessionId: id,
      reason: 'no_heartbeat',
    });
    expect((await allEvents()).at(-1)).toMatchObject({
      type: 'session.ended',
      payload: {
        reason: 'no_heartbeat',
        usage: { kind: 'temporary', usedSeconds: 600, remainingSeconds: 3000 },
      },
    });
  });

  it('al arrancar el nodo cierra las que quedaron sin latidos y respeta las recientes', async () => {
    world = await PcWorld.start(MONDAY);
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    await createCustomerWithBalance(world.testApp, 'maria', { moneyMicros: usd(3) });
    const pc5 = await world.pc(5);
    const pc6 = await world.pc(6);
    await login(pc5, 'juan');
    await login(pc6, 'maria');

    // Latido de las dos a los 5 min y de María a los 8. A los 10 min se "apaga" el nodo.
    world.clock.advance(5 * MINUTE);
    await heartbeat(pc5);
    await heartbeat(pc6);
    world.clock.advance(3 * MINUTE);
    await heartbeat(pc6);
    world.clock.advance(2 * MINUTE);

    await world.testApp.app.get(StaleSessionsJob).onApplicationBootstrap();

    // Juan lleva 5 min sin latidos y se cierra; María, 2 min, y la PC aún puede reconectar.
    expect(await storedSession(5)).toMatchObject({ status: 'ended', endReason: 'no_heartbeat' });
    expect(await storedSession(6)).toMatchObject({ status: 'active' });
    expect(await consumption()).toEqual([{ wallet: 'money', amount: usd(-0.125) }]);
  });

  it('la PC que reconecta con la sesión ya cerrada recibe sessionEnded y no se cobra el hueco', async () => {
    world = await PcWorld.start(MONDAY);
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    const pc = await world.pc(5);
    const { sessionId } = activeSession(await login(pc, 'juan'));
    await world.run(5, 5 * MINUTE, MINUTE);
    pc.close();
    await pc.closed;
    await world.clock.tick(4 * MINUTE);
    expect(await storedSession(5)).toMatchObject({ status: 'ended', endReason: 'no_heartbeat' });
    const billed = await consumption();

    // Vuelve la red: dice tener la sesión y el nodo le contesta que se cerró.
    const { pc: back, state } = await PcTestClient.hello(world.url, devPcId(5), sessionId);
    expect(state).toEqual({ type: 'sessionEnded', sessionId, reason: 'no_heartbeat' });
    expect(await back.next()).toEqual({ type: 'state', status: 'locked' });
    expect(await consumption()).toEqual(billed);
    expect(billed).toEqual([{ wallet: 'money', amount: usd(-0.125) }]);
    back.close();
  });

  it('una temporal cerrada sin latidos queda con el menor entre el restante del nodo y el de la PC', async () => {
    world = await PcWorld.start(MONDAY);
    const id = await insertTemporary();
    const pc = await world.pc(5, id);
    await heartbeat(pc);
    await world.run(5, 10 * MINUTE, MINUTE);
    pc.close();
    await pc.closed;
    await world.clock.tick(4 * MINUTE);
    expect((await storedSession(5)).usedSeconds).toBe(600);

    // La PC siguió contando durante el corte: le quedan 2700 s y el nodo tenía 3000.
    const back = await reconnect(5, id);
    expect(await beatWith(back, id, 2700)).toEqual({
      type: 'sessionEnded',
      sessionId: id,
      reason: 'no_heartbeat',
    });
    expect((await storedSession(5)).usedSeconds).toBe(900);
    expect((await allEvents()).at(-1)).toMatchObject({
      type: 'session.remaining_corrected',
      actor: { kind: 'system' },
      payload: { sessionId: id, pc: { name: 'PC 05' }, from: 3000, to: 2700 },
    });

    // Si la PC informa más tiempo del que tiene el nodo, no cambia nada.
    const before = (await allEvents()).length;
    await beatWith(back, id, 3500);
    expect((await storedSession(5)).usedSeconds).toBe(900);
    expect(await allEvents()).toHaveLength(before);
    back.close();
  });

  it('no corrige el restante de una temporal que ya se restauró', async () => {
    world = await PcWorld.start(MONDAY);
    const id = await insertTemporary();
    const pc = await world.pc(5, id);
    await heartbeat(pc);
    await world.run(5, 10 * MINUTE, MINUTE);
    pc.close();
    await pc.closed;
    await world.clock.tick(4 * MINUTE);

    // Otra sesión, enlazada a esta, ya se llevó el tiempo (REQ-001-68).
    await insertTemporary(6, id);
    const back = await reconnect(5, id);
    await beatWith(back, id, 100);
    expect((await storedSession(5)).usedSeconds).toBe(600);
    back.close();
  });

  it('si la PC dice que no tiene sesión al conectar (se reinició), se cierra al momento', async () => {
    world = await PcWorld.start(MONDAY);
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    const pc = await world.pc(5);
    const { sessionId } = activeSession(await login(pc, 'juan'));
    await world.run(5, 5 * MINUTE, MINUTE);
    const lastBeat = world.clock.now();

    // La PC se reinicia: conecta sin sesión un minuto después de su último latido.
    world.clock.advance(MINUTE);
    const { pc: rebooted, state } = await PcTestClient.hello(world.url, devPcId(5), null);
    expect(state).toEqual({ type: 'sessionEnded', sessionId, reason: 'no_heartbeat' });
    expect(await rebooted.next()).toEqual({ type: 'state', status: 'locked' });
    expect((await allEvents()).at(-1)).toMatchObject({
      type: 'session.ended',
      payload: { reason: 'no_heartbeat', billedUntil: lastBeat.toISOString() },
    });
    expect(await consumption()).toEqual([{ wallet: 'money', amount: usd(-0.125) }]);
    rebooted.close();
  });

  it('un latido que dice "no tengo sesión" no cierra la que acaba de abrirse', async () => {
    world = await PcWorld.start(MONDAY);
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
    const pc = await world.pc(5);
    await login(pc, 'juan');
    await heartbeat(pc);
    expect(await storedSession(5)).toMatchObject({ status: 'active' });
  });
});
