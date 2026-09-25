import { Controller, Get } from '@nestjs/common';
import type { StaffRole } from '@pope/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from '../testing/app.js';
import { createStaffService } from '../testing/staff.js';
import { Roles } from './decorators.js';
import { STAFF_COOKIE } from './staff-cookie.js';

/** Endpoints solo para el test, para probar el guard de roles. */
@Controller('test-roles')
class RolesProbeController {
  @Get('any')
  any(): string {
    return 'ok';
  }

  @Roles('administrador')
  @Get('admin')
  admin(): string {
    return 'ok';
  }

  @Roles('encargado', 'administrador')
  @Get('operate')
  operate(): string {
    return 'ok';
  }
}

describe('login del personal y guard de roles (e2e, REQ-001-40)', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp('local', [RolesProbeController]);
    const staff = createStaffService(testApp.database);
    const members: [string, StaffRole][] = [
      ['ana', 'encargado'],
      ['admin', 'administrador'],
      ['dueno', 'dueno'],
    ];
    for (const [username, role] of members) {
      await staff.create(
        { username, displayName: username, role, password: 'secreto' },
        { kind: 'system' },
      );
    }
  });

  afterEach(async () => {
    await testApp.close();
  });

  async function login(username: string, password = 'secreto') {
    return testApp.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username, password },
    });
  }

  /** Cookie de sesión tras un login correcto, lista para la cabecera `cookie`. */
  async function sessionCookie(username: string): Promise<string> {
    const response = await login(username);
    const cookie = response.cookies.find((c) => c.name === STAFF_COOKIE);
    if (!cookie) {
      throw new Error('El login no devolvió la cookie de sesión');
    }
    return `${STAFF_COOKIE}=${cookie.value}`;
  }

  describe('POST /auth/login', () => {
    it('con credenciales correctas devuelve el perfil y una cookie httpOnly', async () => {
      const response = await login('ana');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ username: 'ana', role: 'encargado' });

      const cookie = response.cookies.find((c) => c.name === STAFF_COOKIE);
      expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/' });
      // En el local el panel va por http: la cookie no puede ser `secure`.
      expect(cookie?.secure).toBeFalsy();
      expect(cookie?.expires).toBeInstanceOf(Date);
    });

    it('con contraseña incorrecta o usuario inexistente responde 401 sin cookie', async () => {
      for (const response of [await login('ana', 'mal'), await login('nadie')]) {
        expect(response.statusCode).toBe(401);
        expect(response.json()).toMatchObject({ message: 'Usuario o contraseña incorrectos' });
        expect(response.cookies).toEqual([]);
      }
    });

    it('rechaza un cuerpo no válido con 400', async () => {
      const response = await testApp.app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { username: 'ana' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ message: 'Datos no válidos' });
    });
  });

  describe('sesión', () => {
    it('GET /auth/me sin cookie responde 401', async () => {
      const response = await testApp.app.inject({ method: 'GET', url: '/auth/me' });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ message: 'Inicia sesión para continuar' });
    });

    it('GET /auth/me con la cookie devuelve quién ha iniciado sesión', async () => {
      const response = await testApp.app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { cookie: await sessionCookie('ana') },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ username: 'ana', role: 'encargado' });
    });

    it('un token inventado no sirve', async () => {
      const response = await testApp.app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { cookie: `${STAFF_COOKIE}=inventado` },
      });
      expect(response.statusCode).toBe(401);
    });

    it('POST /auth/logout cierra la sesión y borra la cookie', async () => {
      const cookie = await sessionCookie('ana');
      const logout = await testApp.app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: { cookie },
      });
      expect(logout.statusCode).toBe(204);
      expect(logout.cookies.find((c) => c.name === STAFF_COOKIE)?.value).toBe('');

      const me = await testApp.app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
      expect(me.statusCode).toBe(401);
    });
  });

  describe('roles (plan 001, "Seguridad")', () => {
    async function get(url: string, username: string) {
      return testApp.app.inject({
        method: 'GET',
        url,
        headers: { cookie: await sessionCookie(username) },
      });
    }

    it('sin @Roles basta con tener sesión', async () => {
      expect((await get('/test-roles/any', 'dueno')).statusCode).toBe(200);
    });

    it('deniega con 403 a quien no tiene el rol', async () => {
      const denied = await get('/test-roles/admin', 'ana');
      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toMatchObject({ message: 'No tienes permiso para esta acción' });
      expect((await get('/test-roles/operate', 'dueno')).statusCode).toBe(403);
    });

    it('permite a quien tiene alguno de los roles', async () => {
      expect((await get('/test-roles/admin', 'admin')).statusCode).toBe(200);
      expect((await get('/test-roles/operate', 'ana')).statusCode).toBe(200);
      expect((await get('/test-roles/operate', 'admin')).statusCode).toBe(200);
    });
  });
});
