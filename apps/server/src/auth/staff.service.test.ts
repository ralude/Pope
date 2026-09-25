import { ConflictException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseHandle } from '../db/database.js';
import { events, staff } from '../db/schema.js';
import { createTestDatabase } from '../testing/database.js';
import { createStaffService } from '../testing/staff.js';
import type { StaffService } from './staff.service.js';

describe('StaffService.create (REQ-001-40)', () => {
  let handle: DatabaseHandle;
  let service: StaffService;

  beforeEach(async () => {
    handle = await createTestDatabase();
    service = createStaffService(handle);
  });

  afterEach(async () => {
    await handle.close();
  });

  it('da de alta al personal con la contraseña en hash y emite staff.created', async () => {
    const ana = await service.create(
      { username: ' Ana ', displayName: 'Ana Pérez', role: 'encargado', password: 'secreto' },
      { kind: 'system' },
    );
    expect(ana).toMatchObject({ username: 'Ana', displayName: 'Ana Pérez', role: 'encargado' });

    const [stored] = await handle.db.select().from(staff).where(eq(staff.id, ana.id));
    expect(stored?.active).toBe(true);
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored?.passwordHash).not.toContain('secreto');

    const [event] = await handle.db.select().from(events);
    expect(event).toMatchObject({
      type: 'staff.created',
      actor: { kind: 'system' },
      payload: { staff: { id: ana.id, username: 'Ana' }, name: 'Ana Pérez', role: 'encargado' },
    });
    expect(JSON.stringify(event)).not.toContain('secreto');
  });

  it('rechaza un usuario repetido aunque cambien las mayúsculas, sin emitir evento', async () => {
    const input = { displayName: 'Ana', role: 'encargado', password: 'a' } as const;
    await service.create({ ...input, username: 'ana' }, { kind: 'system' });
    await expect(
      service.create({ ...input, username: 'ANA' }, { kind: 'system' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await handle.db.select().from(staff)).toHaveLength(1);
    expect(await handle.db.select().from(events)).toHaveLength(1);
  });

  it('cuenta solo los administradores activos', async () => {
    const admin = await service.create(
      { username: 'admin', displayName: 'Admin', role: 'administrador', password: 'a' },
      { kind: 'system' },
    );
    await service.create(
      { username: 'ana', displayName: 'Ana', role: 'encargado', password: 'a' },
      { kind: 'system' },
    );
    expect(await service.countActiveAdministrators()).toBe(1);
    await handle.db.update(staff).set({ active: false }).where(eq(staff.id, admin.id));
    expect(await service.countActiveAdministrators()).toBe(0);
  });
});
