import { devPcId, type PcMap } from '@pope/shared';
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events } from '../db/schema.js';
import { loginAsStaff } from '../testing/auth.js';
import { PcWorld } from '../testing/pc-world.js';

const MONDAY = '2026-09-28T22:00:00Z';

describe('distribución del mapa de PCs (e2e, REQ-001-45)', () => {
  let world: PcWorld;
  let admin: string;

  beforeEach(async () => {
    world = await PcWorld.start(MONDAY);
    admin = await loginAsStaff(world.testApp, 'root', 'administrador', 'Rosa');
  });

  afterEach(async () => {
    await world.close();
  });

  const save = (positions: { n: number; row: number; col: number }[], cookie = admin) =>
    world.api('PUT', '/pcs/map', cookie, {
      positions: positions.map(({ n, row, col }) => ({ pcId: devPcId(n), row, col })),
    });

  const cells = async () => {
    const map = (await world.api('GET', '/pcs/map', admin)).json<PcMap>();
    return Object.fromEntries(
      map.pcs.filter((pc) => pc.row !== null).map((pc) => [pc.name, [pc.row, pc.col]]),
    );
  };

  const mapEvents = async () =>
    (await world.testApp.database.db.select().from(events).orderBy(asc(events.seq))).filter(
      (e) => e.type === 'pc.map_changed',
    );

  it('guarda la distribución y la ve todo el personal', async () => {
    const response = await save([
      { n: 1, row: 0, col: 3 },
      { n: 2, row: 2, col: 0 },
    ]);
    expect(response.statusCode).toBe(204);
    expect(await cells()).toEqual({ 'PC 01': [0, 3], 'PC 02': [2, 0] });

    const ana = await world.cashier();
    const map = (await world.api('GET', '/pcs/map', ana)).json<PcMap>();
    expect(map.pcs.find((pc) => pc.name === 'PC 01')).toMatchObject({ row: 0, col: 3 });
  });

  it('intercambia dos PCs y el evento trae solo las que cambian', async () => {
    await save([
      { n: 1, row: 0, col: 0 },
      { n: 2, row: 0, col: 1 },
      { n: 3, row: 0, col: 2 },
    ]);
    const response = await save([
      { n: 1, row: 0, col: 1 },
      { n: 2, row: 0, col: 0 },
      { n: 3, row: 0, col: 2 },
    ]);
    expect(response.statusCode).toBe(204);
    expect(await cells()).toEqual({ 'PC 01': [0, 1], 'PC 02': [0, 0], 'PC 03': [0, 2] });

    const [first, second] = await mapEvents();
    expect(first?.payload).toMatchObject({ changes: expect.any(Array) as unknown });
    expect(second).toMatchObject({
      type: 'pc.map_changed',
      actor: { kind: 'staff', name: 'Rosa' },
      payload: {
        changes: [
          {
            pc: { id: devPcId(1), name: 'PC 01' },
            from: { row: 0, col: 0 },
            to: { row: 0, col: 1 },
          },
          {
            pc: { id: devPcId(2), name: 'PC 02' },
            from: { row: 0, col: 1 },
            to: { row: 0, col: 0 },
          },
        ],
      },
    });
  });

  it('una PC que deja de venir se queda sin posición; sin cambios no hay evento', async () => {
    await save([
      { n: 1, row: 0, col: 0 },
      { n: 2, row: 0, col: 1 },
    ]);
    await save([{ n: 1, row: 0, col: 0 }]);
    expect(await cells()).toEqual({ 'PC 01': [0, 0] });
    expect((await mapEvents())[1]?.payload).toEqual({
      changes: [{ pc: { id: devPcId(2), name: 'PC 02' }, from: { row: 0, col: 1 }, to: null }],
    });

    expect((await save([{ n: 1, row: 0, col: 0 }])).statusCode).toBe(204);
    expect(await mapEvents()).toHaveLength(2);
  });

  it('rechaza dos PCs en la misma casilla y PCs que no existen, sin tocar nada', async () => {
    await save([{ n: 1, row: 0, col: 0 }]);
    const clash = await save([
      { n: 1, row: 1, col: 1 },
      { n: 2, row: 1, col: 1 },
    ]);
    expect(clash.statusCode).toBe(400);
    expect(clash.json()).toMatchObject({
      issues: [{ path: 'positions.1', message: 'Dos PCs en la misma casilla' }],
    });

    const unknown = await world.api('PUT', '/pcs/map', admin, {
      positions: [{ pcId: '01900000-0000-7000-8000-0000000000ff', row: 0, col: 1 }],
    });
    expect(unknown.statusCode).toBe(404);

    expect(await cells()).toEqual({ 'PC 01': [0, 0] });
    expect(await mapEvents()).toHaveLength(1);
  });

  it('solo el administrador organiza el mapa', async () => {
    const ana = await world.cashier();
    const owner = await loginAsStaff(world.testApp, 'dueno', 'dueno');
    expect((await save([{ n: 1, row: 0, col: 0 }], ana)).statusCode).toBe(403);
    expect((await save([{ n: 1, row: 0, col: 0 }], owner)).statusCode).toBe(403);
    expect((await world.api('PUT', '/pcs/map', null, { positions: [] })).statusCode).toBe(401);
    expect(await mapEvents()).toHaveLength(0);
  });
});
