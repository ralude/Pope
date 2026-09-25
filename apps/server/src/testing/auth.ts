import type { StaffRole } from '@pope/shared';

import { STAFF_COOKIE } from '../auth/staff-cookie.js';
import type { TestApp } from './app.js';
import { createStaffService } from './staff.js';

/**
 * Da de alta a un miembro del personal (contraseña `secreto`) e inicia sesión con él.
 * Devuelve la cabecera `cookie` lista para las peticiones del test.
 */
export async function loginAsStaff(
  testApp: TestApp,
  username: string,
  role: StaffRole,
  displayName = username,
): Promise<string> {
  await createStaffService(testApp.database).create(
    { username, displayName, role, password: 'secreto' },
    { kind: 'system' },
  );
  const response = await testApp.app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username, password: 'secreto' },
  });
  const cookie = response.cookies.find((c) => c.name === STAFF_COOKIE);
  if (!cookie) {
    throw new Error(`No se pudo iniciar sesión como ${username}`);
  }
  return `${STAFF_COOKIE}=${cookie.value}`;
}
