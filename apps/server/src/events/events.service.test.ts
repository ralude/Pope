import { idSchema } from '@pope/shared';
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseHandle } from '../db/database.js';
import { events } from '../db/schema.js';
import { createTestDatabase } from '../testing/database.js';
import { EventsService, type NewDomainEvent } from './events.service.js';

const SHIFT_ID = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a01';

const shiftOpened: NewDomainEvent = {
  type: 'shift.opened',
  version: 1,
  actor: { kind: 'staff', staffId: '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a02', name: 'Ana' },
  payload: { shiftId: SHIFT_ID },
};

describe('EventsService.inTransaction (REQ-001-30, ADR-0008)', () => {
  let handle: DatabaseHandle;
  let service: EventsService;

  beforeEach(async () => {
    handle = await createTestDatabase();
    service = new EventsService(handle.db);
  });

  afterEach(async () => {
    await handle.close();
  });

  const storedEvents = () => handle.db.select().from(events).orderBy(asc(events.seq));

  it('guarda el evento con id UUIDv7, hora en UTC y actor', async () => {
    const before = Date.now();
    await service.inTransaction((_tx, emit) => {
      emit(shiftOpened);
      return Promise.resolve();
    });

    const [stored] = await storedEvents();
    expect(stored).toMatchObject({
      seq: 1,
      type: 'shift.opened',
      version: 1,
      actor: shiftOpened.actor,
      payload: { shiftId: SHIFT_ID },
      sentAt: null,
    });
    expect(idSchema.safeParse(stored?.id).success).toBe(true);
    expect(stored?.occurredAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('avisa a los suscritos solo de lo confirmado, y nunca de una transacción deshecha', async () => {
    const seen: string[][] = [];
    const stop = service.subscribe((committed) => {
      seen.push(committed.map((e) => e.type));
    });

    await service.inTransaction((_tx, emit) => {
      emit(shiftOpened);
      emit({ ...shiftOpened, type: 'shift.closed' });
      return Promise.resolve();
    });
    await service.inTransaction(() => Promise.resolve());
    await expect(
      service.inTransaction((_tx, emit) => {
        emit(shiftOpened);
        return Promise.reject(new Error('falla'));
      }),
    ).rejects.toThrow('falla');
    expect(seen).toEqual([['shift.opened', 'shift.closed']]);

    // Un suscrito que falla no afecta a quien hizo el cambio; y se puede dejar de escuchar.
    const stopBroken = service.subscribe(() => {
      throw new Error('oyente roto');
    });
    await expect(
      service.inTransaction((_tx, emit) => {
        emit(shiftOpened);
        return Promise.resolve('hecho');
      }),
    ).resolves.toBe('hecho');
    stop();
    stopBroken();
    await service.inTransaction((_tx, emit) => {
      emit(shiftOpened);
      return Promise.resolve();
    });
    expect(seen).toHaveLength(2);
  });

  it('numera los eventos con seq creciente, en el orden en que se confirman', async () => {
    for (let i = 0; i < 3; i++) {
      await service.inTransaction((_tx, emit) => {
        emit(shiftOpened);
        emit({ ...shiftOpened, type: 'shift.closed' });
        return Promise.resolve();
      });
    }
    const stored = await storedEvents();
    expect(stored.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(stored.map((e) => e.type)).toEqual([
      'shift.opened',
      'shift.closed',
      'shift.opened',
      'shift.closed',
      'shift.opened',
      'shift.closed',
    ]);
  });

  it('un rollback no deja eventos', async () => {
    await expect(
      service.inTransaction((_tx, emit) => {
        emit(shiftOpened);
        return Promise.reject(new Error('fallo a mitad del cambio'));
      }),
    ).rejects.toThrow('fallo a mitad del cambio');
    expect(await storedEvents()).toEqual([]);
  });

  it('un evento no válido deshace la transacción entera', async () => {
    const invalid = { ...shiftOpened, payload: { shiftId: 'no-es-un-uuid' } };
    await expect(
      service.inTransaction((_tx, emit) => {
        emit(shiftOpened);
        emit(invalid);
        return Promise.resolve();
      }),
    ).rejects.toThrow();
    expect(await storedEvents()).toEqual([]);
  });

  it('los cambios hechos con la transacción se deshacen junto con sus eventos', async () => {
    await expect(
      service.inTransaction(async (tx, emit) => {
        await tx.insert(events).values({
          id: '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a03',
          type: 'otro.cambio',
          version: 1,
          actor: { kind: 'system' },
          occurredAt: new Date(),
          payload: {},
        });
        emit(shiftOpened);
        throw new Error('fallo después de escribir');
      }),
    ).rejects.toThrow('fallo después de escribir');
    expect(await storedEvents()).toEqual([]);
  });

  it('devuelve el resultado del trabajo, aunque no emita eventos', async () => {
    const result = await service.inTransaction(() => Promise.resolve(42));
    expect(result).toBe(42);
    expect(await storedEvents()).toEqual([]);
  });
});
