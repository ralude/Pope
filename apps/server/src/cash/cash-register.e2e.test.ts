import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  type CashMovement,
  type Combo,
  type Customer,
  hours,
  type Product,
  type ShiftEntriesResponse,
  usd,
} from '@pope/shared';
import { asc, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MIGRATIONS_FOLDER } from '../db/database.js';
import { cashEntries, events, ledger } from '../db/schema.js';
import { loginAsStaff } from '../testing/auth.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { PanelClient } from '../testing/panel-client.js';
import { PcWorld } from '../testing/pc-world.js';
import { NO_RATE_MESSAGE } from './cash-register.service.js';
import { NOTHING_COUNTED } from '../testing/shifts.js';

// Lunes 28 de septiembre de 2026, 18:00 en Caracas.
const MONDAY = '2026-09-28T22:00:00Z';

describe('registro de caja (e2e, REQ-005-22, REQ-005-24, REQ-005-41)', () => {
  let world: PcWorld;
  let ana: string;
  let admin: string;
  let juan: Customer;

  beforeEach(async () => {
    world = await PcWorld.start(MONDAY);
    ana = await world.cashier();
    admin = await loginAsStaff(world.testApp, 'admin', 'administrador', 'Luis');
    juan = await createCustomerWithBalance(world.testApp, 'juan');
  });

  afterEach(async () => {
    await world.close();
  });

  const recharge = (paymentMethod: string, amountMicros = usd(3), cookie = ana) =>
    world.api('POST', `/customers/${juan.id}/recharges`, cookie, { amountMicros, paymentMethod });

  const entries = async (cookie = ana) =>
    (await world.api('GET', '/shifts/current/entries', cookie)).json<ShiftEntriesResponse>();

  const rows = () =>
    world.testApp.database.db.select().from(cashEntries).orderBy(asc(cashEntries.createdAt));

  const lastEvent = async () =>
    (await world.testApp.database.db.select().from(events).orderBy(asc(events.seq))).at(-1);

  it('una recarga en efectivo USD es un movimiento de horas de PC con quien la cobró', async () => {
    expect((await recharge('cash_usd')).statusCode).toBe(201);
    const list = await entries();
    expect(list.movements).toEqual([
      {
        source: 'recharge',
        sourceId: expect.any(String) as string,
        at: MONDAY.replace('Z', '.000Z'),
        description: 'Recarga · juan',
        customerName: 'juan',
        lines: [],
        usdMicros: usd(3),
        payments: [{ method: 'cash_usd', currency: 'USD', amountMicros: usd(3), vesRate: null }],
        actorName: 'Ana',
        voided: false,
        reason: null,
      },
    ]);
    expect(list.totals).toEqual({ pc: usd(3), snacks: 0, other: 0, total: usd(3), balance: 0 });
    expect(await lastEvent()).toMatchObject({
      type: 'wallet.recharged',
      version: 2,
      payload: {
        payment: { method: 'cash_usd', amount: { micros: usd(3), currency: 'USD' }, vesRate: null },
      },
    });
  });

  it('REQ-005-22: con pago móvil se guarda en Bs con la tasa vigente, también en el evento', async () => {
    await world.api('POST', '/exchange-rate', ana, { vesPerUsd: 40_000_000 });
    expect((await recharge('mobile_payment')).statusCode).toBe(201);
    expect(await rows()).toMatchObject([
      {
        source: 'recharge',
        group: 'pc',
        method: 'mobile_payment',
        currency: 'VES',
        amountMicros: 120_000_000,
        usdMicros: usd(3),
        vesRate: 40_000_000,
      },
    ]);
    expect(await lastEvent()).toMatchObject({
      type: 'wallet.recharged',
      version: 2,
      payload: {
        amount: { micros: usd(3), currency: 'USD' },
        payment: {
          method: 'mobile_payment',
          amount: { micros: 120_000_000, currency: 'VES' },
          usd: { micros: usd(3), currency: 'USD' },
          vesRate: 40_000_000,
        },
      },
    });
  });

  it('sin tasa no se cobra en Bs, y no queda nada a medias', async () => {
    for (const method of ['cash_ves', 'mobile_payment', 'pos']) {
      const response = await recharge(method);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ message: NO_RATE_MESSAGE });
    }
    expect(await rows()).toHaveLength(0);
    expect(
      (await world.testApp.database.db.select().from(ledger)).filter((r) => r.shiftId !== null),
    ).toHaveLength(0);
  });

  it('temporales, tiempo añadido y combos en caja entran en la lista, el más reciente arriba', async () => {
    const { session } = await world.openTemporary(ana, 5, 60, 'Carlos');
    world.clock.advance(60_000);
    const added = await world.api('POST', `/sessions/${session.id}/time`, admin, {
      paymentMethod: 'cash_usd',
      minutes: 30,
    });
    expect(added.statusCode).toBe(201);
    world.clock.advance(60_000);
    const combo = (
      await world.api('POST', '/combos', admin, {
        name: 'Combo 20 horas',
        priceMicros: usd(20),
        seconds: hours(20),
      })
    ).json<Combo>();
    const bought = await world.api('POST', `/customers/${juan.id}/combo-purchases`, ana, {
      comboId: combo.id,
      payment: { via: 'cash_desk', paymentMethod: 'cash_usd' },
    });
    expect(bought.statusCode).toBe(201);

    const list = await entries(admin);
    expect(list.movements.map((m) => [m.source, m.description, m.actorName])).toEqual([
      ['combo', 'Combo 20 horas · juan', 'Ana'],
      ['temporary', 'Más tiempo · PC 05 · Carlos', 'Luis'],
      ['temporary', 'Sesión temporal · PC 05 · Carlos', 'Ana'],
    ]);
    expect(list.totals.pc).toBe(list.movements.reduce((sum, m) => sum + m.usdMicros, 0));
    expect(await lastEvent()).toMatchObject({
      type: 'combo.purchased',
      version: 2,
      payload: { payment: { via: 'cash_desk', payment: { method: 'cash_usd' } } },
    });
  });

  it('REQ-005-24: cada movimiento lleva su cliente y, las ventas, sus líneas; la migración rellena el cliente', async () => {
    await world.openTemporary(ana, 5, 60, 'Carlos');
    await recharge('cash_usd', usd(5));
    const combo = (
      await world.api('POST', '/combos', admin, {
        name: 'Combo 5 horas',
        priceMicros: usd(6),
        seconds: hours(5),
      })
    ).json<Combo>();
    await world.api('POST', `/customers/${juan.id}/combo-purchases`, ana, {
      comboId: combo.id,
      payment: { via: 'cash_desk', paymentMethod: 'cash_usd' },
    });
    const papas = (
      await world.api('POST', '/products', admin, {
        name: 'Papas',
        priceMicros: usd(1.5),
        minStock: null,
        initialQuantity: 10,
      })
    ).json<Product>();
    const withBalance = (
      await world.api('POST', '/sales', ana, {
        lines: [
          { kind: 'product', productId: papas.id, quantity: 2 },
          { kind: 'other', usdMicros: usd(0.5), comment: '2 copias' },
        ],
        payments: [{ method: 'balance', usdMicros: usd(3.5) }],
        customerId: juan.id,
      })
    ).json<CashMovement>();
    await world.api('POST', `/sales/${withBalance.sourceId}/void`, admin, {
      reason: 'error de cobro',
    });
    await world.api('POST', '/sales', ana, {
      lines: [{ kind: 'other', usdMicros: usd(1.2), comment: null }],
      payments: [{ method: 'cash_usd', usdMicros: usd(1.2) }],
      customerId: null,
    });

    const saleLines = [
      { kind: 'product', name: 'Papas', quantity: 2, usdMicros: usd(3) },
      { kind: 'other', name: 'Otro ingreso · 2 copias', quantity: 1, usdMicros: usd(0.5) },
    ];
    const expected = [
      ['sale', null, [{ kind: 'other', name: 'Otro ingreso', quantity: 1, usdMicros: usd(1.2) }]],
      ['void', 'juan', saleLines],
      ['sale', 'juan', saleLines],
      ['combo', 'juan', []],
      ['recharge', 'juan', []],
      ['temporary', null, []],
    ];
    const shown = async () =>
      (await entries()).movements.map((m) => [m.source, m.customerName, m.lines]);
    expect(await shown()).toEqual(expected);

    // Las filas de antes de la columna: la migración 0023 pone la cuenta desde el origen.
    await world.testApp.database.db.update(cashEntries).set({ customerName: null });
    const migration = readFileSync(join(MIGRATIONS_FOLDER, '0023_cash_entry_customer.sql'), 'utf8');
    for (const statement of migration.split('--> statement-breakpoint')) {
      const body = statement.replace(/^--.*$/gm, '').trim();
      if (body.startsWith('UPDATE')) {
        await world.testApp.database.db.execute(sql.raw(body));
      }
    }
    expect(await shown()).toEqual(expected);
  });

  it('el dueño también ve la lista; sin caja abierta responde 409', async () => {
    const owner = await loginAsStaff(world.testApp, 'duena', 'dueno');
    const open = await world.api('GET', '/shifts/current/entries', owner);
    expect(open.statusCode).toBe(200);
    // Quién abrió, cuándo y con qué fondo: la fila de apertura de la tabla (REQ-005-24).
    expect(open.json<ShiftEntriesResponse>()).toMatchObject({
      staffName: 'Ana',
      openedAt: MONDAY.replace('Z', '.000Z'),
      opening: { cashUsdMicros: 0, cashVesMicros: 0 },
    });
    await world.api('POST', '/shifts/current/close', ana, NOTHING_COUNTED);
    const closed = await world.api('GET', '/shifts/current/entries', owner);
    expect(closed.statusCode).toBe(409);
    expect(closed.json()).toMatchObject({ message: 'No hay una caja abierta' });
  });

  it('el panel recibe el aviso "cash" al cobrar', async () => {
    const address = world.url.replace(/\/pc$/, '/panel');
    const panel = PanelClient.connect(address, ana);
    await panel.nextMap();
    await recharge('cash_usd');
    expect(await panel.nextCash()).toBe(true);
    panel.close();
  });

  it('la migración pasa al registro los cobros anteriores, igual que el nodo', async () => {
    await world.openTemporary(ana, 5, 60, 'Carlos');
    await recharge('cash_usd', usd(2));
    const combo = (
      await world.api('POST', '/combos', admin, {
        name: 'Combo 5 horas',
        priceMicros: usd(6),
        seconds: hours(5),
      })
    ).json<Combo>();
    await world.api('POST', `/customers/${juan.id}/combo-purchases`, ana, {
      comboId: combo.id,
      payment: { via: 'cash_desk', paymentMethod: 'cash_usd' },
    });
    // Lo que escribió el nodo, sin el id ni la hora (la migración usa los del origen).
    const comparable = async () =>
      (await rows())
        .map((row) => ({
          shiftId: row.shiftId,
          source: row.source,
          sourceId: row.sourceId,
          group: row.group,
          method: row.method,
          currency: row.currency,
          amountMicros: row.amountMicros,
          usdMicros: row.usdMicros,
          vesRate: row.vesRate,
          description: row.description,
          actor: row.actor,
        }))
        .sort((a, b) => a.sourceId.localeCompare(b.sourceId));
    const written = await comparable();

    await world.testApp.database.db.delete(cashEntries);
    const migration = readFileSync(join(MIGRATIONS_FOLDER, '0018_cash_entries.sql'), 'utf8');
    for (const statement of migration.split('--> statement-breakpoint')) {
      const body = statement.replace(/^--.*$/gm, '').trim();
      if (body.startsWith('INSERT')) {
        await world.testApp.database.db.execute(sql.raw(body));
      }
    }
    expect(await comparable()).toEqual(written);
  });
});
