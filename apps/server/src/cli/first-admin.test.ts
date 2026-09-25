import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { StaffService } from '../auth/staff.service.js';
import type { DatabaseHandle } from '../db/database.js';
import { events, staff } from '../db/schema.js';
import { createTestDatabase } from '../testing/database.js';
import { createStaffService } from '../testing/staff.js';
import { AdminAlreadyExistsError, createFirstAdmin } from './first-admin.js';

describe('createFirstAdmin (T14c, REQ-001-40)', () => {
  let handle: DatabaseHandle;
  let service: StaffService;

  beforeEach(async () => {
    handle = await createTestDatabase();
    service = createStaffService(handle);
  });

  afterEach(async () => {
    await handle.close();
  });

  it('crea un administrador y emite staff.created con actor system', async () => {
    const admin = await createFirstAdmin(service, {
      username: 'gerardo',
      displayName: 'Gerardo',
      password: 'secreto',
    });
    expect(admin).toMatchObject({ username: 'gerardo', role: 'administrador' });

    const [event] = await handle.db.select().from(events);
    expect(event).toMatchObject({
      type: 'staff.created',
      actor: { kind: 'system' },
      payload: { role: 'administrador', name: 'Gerardo' },
    });
  });

  it('se niega si ya hay un administrador activo', async () => {
    const input = { username: 'gerardo', displayName: 'Gerardo', password: 'secreto' };
    await createFirstAdmin(service, input);
    await expect(createFirstAdmin(service, { ...input, username: 'otro' })).rejects.toBeInstanceOf(
      AdminAlreadyExistsError,
    );
    expect(await handle.db.select().from(staff)).toHaveLength(1);
  });

  it('permite crearlo si solo hay encargados', async () => {
    await service.create(
      { username: 'ana', displayName: 'Ana', role: 'encargado', password: 'a' },
      { kind: 'system' },
    );
    await expect(
      createFirstAdmin(service, { username: 'admin', displayName: 'Admin', password: 'a' }),
    ).resolves.toMatchObject({ role: 'administrador' });
  });

  it('rechaza datos vacíos', async () => {
    await expect(
      createFirstAdmin(service, { username: ' ', displayName: 'Admin', password: 'a' }),
    ).rejects.toThrow();
    await expect(
      createFirstAdmin(service, { username: 'admin', displayName: 'Admin', password: '' }),
    ).rejects.toThrow();
    expect(await handle.db.select().from(staff)).toEqual([]);
  });
});
