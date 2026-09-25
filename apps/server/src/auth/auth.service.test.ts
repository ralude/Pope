import type { StaffProfile } from '@pope/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseHandle } from '../db/database.js';
import { staff, staffSessions } from '../db/schema.js';
import { FakeClock } from '../testing/clock.js';
import { createTestDatabase } from '../testing/database.js';
import { createStaffService } from '../testing/staff.js';
import { AuthService, STAFF_SESSION_TTL_MS } from './auth.service.js';
import { PasswordService } from './password.service.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('AuthService: sesiones del personal (REQ-001-40)', () => {
  let handle: DatabaseHandle;
  let clock: FakeClock;
  let auth: AuthService;
  let ana: StaffProfile;

  beforeEach(async () => {
    handle = await createTestDatabase();
    clock = new FakeClock();
    auth = new AuthService(handle.db, new PasswordService(), clock);
    ana = await createStaffService(handle).create(
      { username: 'Ana', displayName: 'Ana Pérez', role: 'encargado', password: 'secreto' },
      { kind: 'system' },
    );
  });

  afterEach(async () => {
    await handle.close();
  });

  describe('login', () => {
    it('con usuario y contraseña correctos abre una sesión de 7 días', async () => {
      const login = await auth.login('Ana', 'secreto');
      expect(login?.staff).toEqual(ana);
      expect(login?.expiresAt).toEqual(new Date(clock.now().getTime() + STAFF_SESSION_TTL_MS));
    });

    it('no distingue mayúsculas en el usuario', async () => {
      expect(await auth.login('  aNA ', 'secreto')).not.toBeNull();
    });

    it('guarda solo el hash del token, nunca el token', async () => {
      const login = await auth.login('Ana', 'secreto');
      const [session] = await handle.db.select().from(staffSessions);
      expect(login?.token.length).toBeGreaterThanOrEqual(43);
      expect(session?.tokenHash).not.toBe(login?.token);
      expect(session?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('rechaza la contraseña incorrecta y el usuario inexistente sin abrir sesión', async () => {
      expect(await auth.login('Ana', 'Secreto')).toBeNull();
      expect(await auth.login('nadie', 'secreto')).toBeNull();
      expect(await handle.db.select().from(staffSessions)).toEqual([]);
    });

    it('rechaza al personal desactivado', async () => {
      await handle.db.update(staff).set({ active: false }).where(eq(staff.id, ana.id));
      expect(await auth.login('Ana', 'secreto')).toBeNull();
    });
  });

  describe('authenticate', () => {
    it('reconoce el token de una sesión abierta', async () => {
      const login = await auth.login('Ana', 'secreto');
      const result = await auth.authenticate(login?.token ?? '');
      expect(result?.staff).toEqual(ana);
      expect(result?.renewed).toBe(false);
    });

    it('rechaza un token desconocido', async () => {
      await auth.login('Ana', 'secreto');
      expect(await auth.authenticate('token-inventado')).toBeNull();
    });

    it('caduca a los 7 días sin uso', async () => {
      const login = await auth.login('Ana', 'secreto');
      clock.advance(7 * DAY);
      expect(await auth.authenticate(login?.token ?? '')).toBeNull();
    });

    it('se renueva con el uso: usada al día 6, sigue valiendo al día 12', async () => {
      const login = await auth.login('Ana', 'secreto');
      const token = login?.token ?? '';
      clock.advance(6 * DAY);
      const renewed = await auth.authenticate(token);
      expect(renewed?.renewed).toBe(true);
      expect(renewed?.expiresAt).toEqual(new Date(clock.now().getTime() + STAFF_SESSION_TTL_MS));
      clock.advance(6 * DAY);
      expect(await auth.authenticate(token)).not.toBeNull();
    });

    it('no escribe en la base de datos en cada petición: renueva como mucho cada hora', async () => {
      const login = await auth.login('Ana', 'secreto');
      clock.advance(30 * 60 * 1000);
      expect((await auth.authenticate(login?.token ?? ''))?.renewed).toBe(false);
      clock.advance(31 * 60 * 1000);
      expect((await auth.authenticate(login?.token ?? ''))?.renewed).toBe(true);
    });

    it('deja de valer si se desactiva al miembro del personal', async () => {
      const login = await auth.login('Ana', 'secreto');
      await handle.db.update(staff).set({ active: false }).where(eq(staff.id, ana.id));
      expect(await auth.authenticate(login?.token ?? '')).toBeNull();
    });
  });

  describe('logout', () => {
    it('cierra solo la sesión de ese token', async () => {
      const first = await auth.login('Ana', 'secreto');
      const second = await auth.login('Ana', 'secreto');
      await auth.logout(first?.token ?? '');
      expect(await auth.authenticate(first?.token ?? '')).toBeNull();
      expect(await auth.authenticate(second?.token ?? '')).not.toBeNull();
    });

    it('con un token desconocido no hace nada', async () => {
      await expect(auth.logout('token-inventado')).resolves.toBeUndefined();
    });
  });
});
