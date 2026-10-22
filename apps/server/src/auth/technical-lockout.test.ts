import { TECHNICAL_LOGIN_LOCK_SECONDS } from '@pope/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseHandle } from '../db/database.js';
import { events, staff, staffTechnicalLoginAttempts } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';
import { FakeClock } from '../testing/clock.js';
import { createTestDatabase } from '../testing/database.js';
import { createStaffService } from '../testing/staff.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { TechnicalAuthService } from './technical-auth.service.js';

const PC4 = { id: '01900000-0000-7000-8000-000000000004', name: 'PC 04' };
const PC5 = { id: '01900000-0000-7000-8000-000000000005', name: 'PC 05' };

describe('login técnico: diez fallos y bloqueo de 1 min (REQ-003-45, CA-003-10, T36a)', () => {
  let handle: DatabaseHandle;
  let clock: FakeClock;
  let technical: TechnicalAuthService;
  let anaId: string;

  beforeEach(async () => {
    handle = await createTestDatabase();
    clock = new FakeClock();
    const passwords = new PasswordService();
    technical = new TechnicalAuthService(handle.db, passwords, new EventsService(handle.db), clock);
    const created = await createStaffService(handle).create(
      { username: 'ana', displayName: 'Ana', role: 'encargado', password: 'secreto' },
      { kind: 'system' },
    );
    anaId = created.id;
  });

  afterEach(async () => {
    await handle.close();
  });

  const fail = (pc = PC4) => technical.verify('ana', 'mal', pc);
  const ok = (pc = PC4) => technical.verify('ana', 'secreto', pc);

  async function attempts() {
    const [row] = await handle.db
      .select()
      .from(staffTechnicalLoginAttempts)
      .where(eq(staffTechnicalLoginAttempts.staffId, anaId));
    return row;
  }

  async function lockEvents() {
    return (await handle.db.select().from(events)).filter(
      (event) => event.type === 'staff.technical_login_locked',
    );
  }

  it('un acierto antes del décimo fallo reinicia el contador', async () => {
    for (let i = 0; i < 9; i++)
      expect(await fail()).toMatchObject({ reason: 'invalid_credentials' });
    expect((await attempts())?.failedLogins).toBe(9);
    expect(await ok()).toMatchObject({ ok: true });
    expect(await attempts()).toMatchObject({ failedLogins: 0, lockedUntil: null });
    for (let i = 0; i < 9; i++) await fail();
    expect(await lockEvents()).toEqual([]);
  });

  it('diez fallos desde distintas PCs bloquean 60 s y avisan una sola vez', async () => {
    for (let i = 0; i < 9; i++) await fail(i % 2 === 0 ? PC4 : PC5);
    const tenth = await fail(PC5);
    const lockedUntil = new Date(clock.now().getTime() + TECHNICAL_LOGIN_LOCK_SECONDS * 1_000);
    expect(tenth).toEqual({ ok: false, reason: 'locked', lockedUntil });
    expect(await attempts()).toMatchObject({ failedLogins: 10, lockedUntil });
    expect(await lockEvents()).toMatchObject([
      {
        actor: { kind: 'system' },
        payload: {
          staffId: anaId,
          username: 'ana',
          pc: PC5,
          lockedUntil: lockedUntil.toISOString(),
        },
      },
    ]);
    // Más intentos durante el bloqueo no suman ni vuelven a avisar.
    await fail(PC4);
    await fail(PC5);
    expect(await lockEvents()).toHaveLength(1);
  });

  it('bloqueada no mira la contraseña: ni la buena entra ni se reinicia el bloqueo', async () => {
    for (let i = 0; i < 10; i++) await fail();
    clock.advance(30_000);
    expect(await ok(PC5)).toMatchObject({ ok: false, reason: 'locked' });
    expect(await attempts()).toMatchObject({ failedLogins: 10 });
  });

  it('a los 60 s admite de nuevo y el contador empieza de cero', async () => {
    for (let i = 0; i < 10; i++) await fail();
    clock.advance(TECHNICAL_LOGIN_LOCK_SECONDS * 1_000);
    expect(await fail()).toMatchObject({ reason: 'invalid_credentials' });
    expect(await attempts()).toMatchObject({ failedLogins: 1, lockedUntil: null, lockedAt: null });
    clock.advance(1_000);
    for (let i = 0; i < 9; i++) await fail();
    expect(await attempts()).toMatchObject({ failedLogins: 10 });
    expect(await lockEvents()).toHaveLength(2);
  });

  it('tras el bloqueo un acierto vuelve a admitir y reinicia', async () => {
    for (let i = 0; i < 10; i++) await fail();
    clock.advance(TECHNICAL_LOGIN_LOCK_SECONDS * 1_000);
    expect(await ok()).toMatchObject({ ok: true });
    expect(await attempts()).toMatchObject({ failedLogins: 0, lockedUntil: null });
  });

  it('el décimo fallo simultáneo emite un solo aviso', async () => {
    for (let i = 0; i < 9; i++) await fail();
    const results = await Promise.all([fail(PC4), fail(PC5), fail(PC4)]);
    expect(results.every((result) => !result.ok && result.reason !== 'invalid_credentials')).toBe(
      true,
    );
    expect(await lockEvents()).toHaveLength(1);
    expect((await attempts())?.failedLogins).toBe(10);
  });

  it('el contador es de la cuenta y no afecta al login del panel ni a otras cuentas', async () => {
    await createStaffService(handle).create(
      { username: 'luis', displayName: 'Luis', role: 'administrador', password: 'secreto' },
      { kind: 'system' },
    );
    for (let i = 0; i < 10; i++) await fail();
    expect(await technical.verify('luis', 'secreto', PC4)).toMatchObject({ ok: true });
    const panel = new AuthService(handle.db, new PasswordService(), clock);
    expect(await panel.login('ana', 'secreto')).not.toBeNull();
  });

  it('una cuenta inexistente no deja contador y no revela nada', async () => {
    for (let i = 0; i < 12; i++) {
      expect(await technical.verify('nadie', 'x', PC4)).toEqual({
        ok: false,
        reason: 'invalid_credentials',
      });
    }
    expect(await handle.db.select().from(staffTechnicalLoginAttempts)).toEqual([]);
    expect((await handle.db.select().from(staff)).length).toBe(1);
  });

  it('el bloqueo se conserva en la base de datos aunque el nodo se reinicie', async () => {
    for (let i = 0; i < 10; i++) await fail();
    const restarted = new TechnicalAuthService(
      handle.db,
      new PasswordService(),
      new EventsService(handle.db),
      clock,
    );
    expect(await restarted.verify('ana', 'secreto', PC4)).toMatchObject({
      ok: false,
      reason: 'locked',
    });
  });

  it('no registra contraseñas ni en el evento del bloqueo', async () => {
    for (let i = 0; i < 10; i++) await technical.verify('ana', 'clave-erronea-123', PC4);
    expect(JSON.stringify(await lockEvents())).not.toContain('clave-erronea-123');
  });
});
