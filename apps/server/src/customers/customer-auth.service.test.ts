import type { Customer } from '@pope/shared';
import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PasswordService } from '../auth/password.service.js';
import type { DatabaseHandle } from '../db/database.js';
import { customers, events } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';
import { FakeClock } from '../testing/clock.js';
import { createTestDatabase } from '../testing/database.js';
import { CustomerAuthService, LOGIN_LOCK_MS, MAX_FAILED_LOGINS } from './customer-auth.service.js';
import { CustomersService } from './customers.service.js';

const SYSTEM = { kind: 'system' } as const;

describe('CustomerAuthService: credenciales y bloqueo por intentos (REQ-001-51, REQ-001-52)', () => {
  let handle: DatabaseHandle;
  let clock: FakeClock;
  let auth: CustomerAuthService;
  let customersService: CustomersService;
  let juan: Customer;

  beforeEach(async () => {
    handle = await createTestDatabase();
    clock = new FakeClock();
    const eventsService = new EventsService(handle.db);
    const passwords = new PasswordService();
    auth = new CustomerAuthService(handle.db, eventsService, passwords, clock);
    customersService = new CustomersService(handle.db, eventsService, passwords, clock);
    juan = await customersService.create(
      { username: 'Juan', password: '1234', name: null, phone: null },
      SYSTEM,
    );
  });

  afterEach(async () => {
    await handle.close();
  });

  async function failTimes(times: number) {
    for (let i = 0; i < times; i++) {
      await auth.verify('juan', 'mala');
    }
  }

  const eventTypes = async () =>
    (await handle.db.select().from(events).orderBy(asc(events.seq))).map((e) => e.type);

  const storedRow = async () => {
    const [row] = await handle.db.select().from(customers).where(eq(customers.id, juan.id));
    return row;
  };

  describe('credenciales', () => {
    it('acepta usuario y contraseña correctos, sin distinguir mayúsculas en el usuario', async () => {
      expect(await auth.verify(' JUAN ', '1234')).toEqual({ ok: true, customer: juan });
    });

    it('rechaza la contraseña incorrecta y el usuario inexistente con el mismo motivo', async () => {
      const invalid = { ok: false, reason: 'invalid_credentials' };
      expect(await auth.verify('juan', '12345')).toEqual(invalid);
      expect(await auth.verify('nadie', '1234')).toEqual(invalid);
    });

    it('con la contraseña correcta avisa si la cuenta está bloqueada o desactivada (REQ-001-04)', async () => {
      await customersService.setStatus(juan.id, 'blocked', SYSTEM);
      expect(await auth.verify('juan', '1234')).toEqual({
        ok: false,
        reason: 'account_inactive',
        status: 'blocked',
      });
      await customersService.setStatus(juan.id, 'disabled', SYSTEM);
      expect(await auth.verify('juan', '1234')).toMatchObject({ status: 'disabled' });
    });

    it('con la contraseña incorrecta no revela el estado de la cuenta', async () => {
      await customersService.setStatus(juan.id, 'blocked', SYSTEM);
      expect(await auth.verify('juan', 'mala')).toEqual({
        ok: false,
        reason: 'invalid_credentials',
      });
    });
  });

  describe('bloqueo por intentos (REQ-001-52)', () => {
    it('5 fallos → bloqueada 5 min aunque acierte → desbloqueada después', async () => {
      await failTimes(MAX_FAILED_LOGINS - 1);
      expect(await eventTypes()).not.toContain('customer.login_locked');

      const lockedUntil = new Date(clock.now().getTime() + LOGIN_LOCK_MS);
      expect(await auth.verify('juan', 'mala')).toEqual({
        ok: false,
        reason: 'account_locked',
        lockedUntil,
      });
      expect(await auth.verify('juan', '1234')).toMatchObject({ reason: 'account_locked' });

      clock.advance(LOGIN_LOCK_MS - 1000);
      expect(await auth.verify('juan', '1234')).toMatchObject({ reason: 'account_locked' });

      clock.advance(1000);
      expect(await auth.verify('juan', '1234')).toMatchObject({ ok: true });
      expect(await storedRow()).toMatchObject({ failedLogins: 0, lockedUntil: null });
    });

    it('emite customer.login_locked con el actor sistema y la hora de fin', async () => {
      await failTimes(MAX_FAILED_LOGINS);
      const [locked] = await handle.db
        .select()
        .from(events)
        .where(eq(events.type, 'customer.login_locked'));
      expect(locked).toMatchObject({
        actor: SYSTEM,
        payload: {
          customer: { id: juan.id, username: 'Juan' },
          lockedUntil: new Date(clock.now().getTime() + LOGIN_LOCK_MS).toISOString(),
        },
      });
    });

    it('los intentos durante el bloqueo no lo alargan', async () => {
      await failTimes(MAX_FAILED_LOGINS);
      clock.advance(LOGIN_LOCK_MS / 2);
      await failTimes(10);
      clock.advance(LOGIN_LOCK_MS / 2);
      expect(await auth.verify('juan', '1234')).toMatchObject({ ok: true });
      expect((await eventTypes()).filter((t) => t === 'customer.login_locked')).toHaveLength(1);
    });

    it('al terminar el bloqueo vuelve a tener 5 intentos', async () => {
      await failTimes(MAX_FAILED_LOGINS);
      clock.advance(LOGIN_LOCK_MS);
      await failTimes(MAX_FAILED_LOGINS - 1);
      expect(await auth.verify('juan', '1234')).toMatchObject({ ok: true });
    });

    it('un login correcto pone el contador a cero', async () => {
      await failTimes(MAX_FAILED_LOGINS - 1);
      await auth.verify('juan', '1234');
      await failTimes(MAX_FAILED_LOGINS - 1);
      expect(await auth.verify('juan', '1234')).toMatchObject({ ok: true });
    });

    it('los fallos cuentan también en una cuenta bloqueada por el encargado', async () => {
      await customersService.setStatus(juan.id, 'blocked', SYSTEM);
      await failTimes(MAX_FAILED_LOGINS);
      expect(await auth.verify('juan', '1234')).toMatchObject({ reason: 'account_locked' });
    });

    it('un usuario inexistente no deja rastro', async () => {
      await auth.verify('nadie', 'mala');
      expect(await eventTypes()).toEqual(['customer.created']);
    });
  });
});
