import { newId, usd } from '@pope/shared';
import { asc, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { events, ledger, sessions } from '../db/schema.js';
import { devPcId } from '../pcs/dev-pcs.js';
import { loginAsStaff } from '../testing/auth.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { heartbeat, login, logout, PcWorld } from '../testing/pc-world.js';
import { assertBalancesMatchLedger } from '../testing/wallet.js';
import { WalletService } from '../wallet/wallet.service.js';

const MINUTE = 60_000;
// 18:00 en Caracas de un lunes: 1,50 USD/h.
const MONDAY = '2026-09-28T22:00:00Z';

describe('cierre de sesiones (e2e, REQ-001-26, REQ-001-31)', () => {
  let world: PcWorld;

  afterEach(async () => {
    await world.close();
  });

  async function start() {
    world = await PcWorld.start(MONDAY);
    return world.testApp;
  }

  /** Movimientos de consumo del ledger, del más antiguo al más nuevo. */
  async function consumption() {
    const rows = await world.testApp.database.db
      .select()
      .from(ledger)
      .where(eq(ledger.kind, 'consumption'))
      .orderBy(asc(ledger.createdAt), asc(ledger.id));
    return rows.map(({ wallet, amount }) => ({ wallet, amount }));
  }

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

  async function lastEvent() {
    const all = await world.testApp.database.db.select().from(events).orderBy(asc(events.seq));
    return all.at(-1);
  }

  it('el cliente cierra desde el Shell: liquida combo y dinero en dos filas y bloquea la PC', async () => {
    const testApp = await start();
    await createCustomerWithBalance(testApp, 'juan', { moneyMicros: usd(3), comboSeconds: 1800 });
    const pc = await world.pc(5);
    await login(pc, 'juan');

    // 45 min: 30 min de combo y 15 min de dinero (15 min × 1,50 USD/h = 0,375 USD).
    world.clock.advance(45 * MINUTE);
    const session = await storedSession(5);
    const ended = await logout(pc);

    expect(ended).toEqual({ type: 'sessionEnded', sessionId: session.id, reason: 'customer' });
    expect(await consumption()).toEqual([
      { wallet: 'combo', amount: -1800 },
      { wallet: 'money', amount: usd(-0.375) },
    ]);
    await assertBalancesMatchLedger(testApp.database.db);
    const closed = await storedSession(5);
    expect(closed).toMatchObject({ status: 'ended', endReason: 'customer' });
    expect(closed.endedAt).toEqual(world.clock.now());
    expect(await lastEvent()).toMatchObject({
      type: 'session.ended',
      actor: { kind: 'customer', username: 'juan' },
      payload: {
        sessionId: session.id,
        pc: { id: devPcId(5), name: 'PC 05' },
        reason: 'customer',
        billedUntil: world.clock.now().toISOString(),
        usage: {
          kind: 'account',
          comboSecondsUsed: 1800,
          moneySeconds: 900,
          moneyCharged: { micros: usd(0.375), currency: 'USD' },
        },
      },
    });
    expect(await heartbeat(pc)).toEqual({ type: 'state', status: 'locked' });
  });

  it('solo escribe una fila por monedero con consumo', async () => {
    const testApp = await start();
    await createCustomerWithBalance(testApp, 'juan', { moneyMicros: usd(3) });
    await createCustomerWithBalance(testApp, 'maria', { moneyMicros: usd(3) });
    const pc5 = await world.pc(5);
    const pc6 = await world.pc(6);
    await login(pc5, 'juan');
    await login(pc6, 'maria');

    // Juan no llega a usar nada; María usa 1 h.
    await logout(pc5);
    expect(await consumption()).toEqual([]);
    world.clock.advance(60 * MINUTE);
    await logout(pc6);
    expect(await consumption()).toEqual([{ wallet: 'money', amount: usd(-1.5) }]);
    await assertBalancesMatchLedger(testApp.database.db);
  });

  it('el encargado cierra cualquier sesión y la PC se bloquea', async () => {
    const testApp = await start();
    await createCustomerWithBalance(testApp, 'juan', { moneyMicros: usd(3) });
    const pc = await world.pc(5);
    await login(pc, 'juan');
    world.clock.advance(30 * MINUTE);
    const session = await storedSession(5);
    const cookie = await loginAsStaff(testApp, 'ana', 'encargado', 'Ana');

    const response = await testApp.app.inject({
      method: 'POST',
      url: `/sessions/${session.id}/close`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(204);
    expect(await pc.next()).toEqual({
      type: 'sessionEnded',
      sessionId: session.id,
      reason: 'staff',
    });
    expect(await consumption()).toEqual([{ wallet: 'money', amount: usd(-0.75) }]);
    await assertBalancesMatchLedger(testApp.database.db);
    expect(await storedSession(5)).toMatchObject({ status: 'ended', endReason: 'staff' });
    expect(await lastEvent()).toMatchObject({
      type: 'session.ended',
      actor: { kind: 'staff', name: 'Ana' },
      payload: { reason: 'staff', usage: { kind: 'account', moneySeconds: 1800 } },
    });
  });

  it('el cierre del personal responde 404, 409 y respeta los permisos', async () => {
    const testApp = await start();
    await createCustomerWithBalance(testApp, 'juan', { moneyMicros: usd(3) });
    await login(await world.pc(5), 'juan');
    const session = await storedSession(5);
    const close = (id: string, cookie?: string) =>
      testApp.app.inject({
        method: 'POST',
        url: `/sessions/${id}/close`,
        headers: cookie ? { cookie } : {},
      });
    const owner = await loginAsStaff(testApp, 'duena', 'dueno');
    const staff = await loginAsStaff(testApp, 'ana', 'encargado');

    expect((await close(session.id)).statusCode).toBe(401);
    expect((await close(session.id, owner)).statusCode).toBe(403);
    expect((await close('no-es-un-id', staff)).statusCode).toBe(400);
    expect((await close(newId(), staff)).statusCode).toBe(404);
    expect((await close(session.id, staff)).statusCode).toBe(204);
    const again = await close(session.id, staff);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ message: 'La sesión ya está cerrada' });
  });

  it('logout sin sesión activa devuelve la pantalla de bloqueo', async () => {
    await start();
    expect(await logout(await world.pc(5))).toEqual({ type: 'state', status: 'locked' });
  });

  it('si el saldo bajó durante la sesión, solo se descuenta lo que había', async () => {
    const testApp = await start();
    const juan = await createCustomerWithBalance(testApp, 'juan', { moneyMicros: usd(3) });
    const pc = await world.pc(5);
    await login(pc, 'juan');
    world.clock.advance(60 * MINUTE);
    await heartbeat(pc);

    // Un ajuste deja la cuenta con 0,50 USD cuando la sesión ya lleva 1,50 USD consumidos.
    await testApp.database.db.transaction((tx) =>
      testApp.app.get(WalletService).post(tx, {
        customerId: juan.id,
        wallet: 'money',
        amount: usd(-2.5),
        kind: 'adjustment',
        reason: 'Corrección de prueba',
        actor: { kind: 'system' },
      }),
    );
    await logout(pc);

    expect(await consumption()).toEqual([{ wallet: 'money', amount: usd(-0.5) }]);
    await assertBalancesMatchLedger(testApp.database.db);
    expect(await storedSession(5)).toMatchObject({ status: 'ended' });
  });

  it('una sesión temporal cierra sin ledger y anota lo que sobró', async () => {
    const testApp = await start();
    const id = newId();
    await testApp.database.db.insert(sessions).values({
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

    expect(await logout(pc)).toMatchObject({ type: 'sessionEnded', reason: 'customer' });
    expect(await consumption()).toEqual([]);
    expect(await lastEvent()).toMatchObject({
      type: 'session.ended',
      actor: { kind: 'system' },
      payload: {
        reason: 'customer',
        usage: {
          kind: 'temporary',
          purchasedSeconds: 3600,
          usedSeconds: 1200,
          remainingSeconds: 2400,
        },
      },
    });
  });
});
