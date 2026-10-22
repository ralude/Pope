import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseHandle } from '../db/database.js';
import { staffSessions } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';
import { FakeClock } from '../testing/clock.js';
import { createTestDatabase } from '../testing/database.js';
import { createStaffService } from '../testing/staff.js';
import { PasswordService } from './password.service.js';
import { TechnicalAuthService } from './technical-auth.service.js';

const PC = { id: '01900000-0000-7000-8000-000000000004', name: 'PC 04' };

describe('TechnicalAuthService: login técnico sin cookie (REQ-003-40, T35a)', () => {
  let handle: DatabaseHandle;
  let technical: TechnicalAuthService;

  beforeEach(async () => {
    handle = await createTestDatabase();
    technical = new TechnicalAuthService(
      handle.db,
      new PasswordService(),
      new EventsService(handle.db),
      new FakeClock(),
    );
    const staff = createStaffService(handle);
    const system = { kind: 'system' } as const;
    await staff.create(
      { username: 'ana', displayName: 'Ana', role: 'encargado', password: 'secreto' },
      system,
    );
    await staff.create(
      { username: 'luis', displayName: 'Luis', role: 'administrador', password: 'secreto' },
      system,
    );
    await staff.create(
      { username: 'eva', displayName: 'Eva', role: 'dueno', password: 'secreto' },
      system,
    );
    const baja = await staff.create(
      { username: 'baja', displayName: 'Baja', role: 'encargado', password: 'secreto' },
      system,
    );
    await staff.setActive(baja.id, false, system);
  });

  afterEach(async () => {
    await handle.close();
  });

  it('admite al encargado y al administrador, sin distinguir mayúsculas en el usuario', async () => {
    const ana = await technical.verify(' ANA ', 'secreto', PC);
    expect(ana).toMatchObject({ ok: true, staff: { username: 'ana', role: 'encargado' } });
    expect(await technical.verify('luis', 'secreto', PC)).toMatchObject({
      ok: true,
      staff: { role: 'administrador' },
    });
  });

  it('rechaza al dueño aunque la contraseña sea correcta', async () => {
    expect(await technical.verify('eva', 'secreto', PC)).toEqual({
      ok: false,
      reason: 'forbidden',
    });
  });

  it('rechaza al personal desactivado con su propio motivo', async () => {
    expect(await technical.verify('baja', 'secreto', PC)).toEqual({
      ok: false,
      reason: 'staff_inactive',
    });
    // Con la contraseña mal no se revela que la cuenta existe ni que está desactivada.
    expect(await technical.verify('baja', 'otra', PC)).toEqual({
      ok: false,
      reason: 'invalid_credentials',
    });
  });

  it('rechaza la contraseña incorrecta y el usuario inexistente igual', async () => {
    const invalid = { ok: false, reason: 'invalid_credentials' };
    expect(await technical.verify('ana', 'Secreto', PC)).toEqual(invalid);
    expect(await technical.verify('nadie', 'secreto', PC)).toEqual(invalid);
  });

  it('no crea sesión del panel', async () => {
    await technical.verify('ana', 'secreto', PC);
    expect(await handle.db.select().from(staffSessions)).toEqual([]);
  });
});
