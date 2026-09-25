import type { CookieSerializeOptions } from '@fastify/cookie';

import type { AppConfig } from '../config.js';

/** Cookie de la sesión del personal en el panel. */
export const STAFF_COOKIE = 'pope_staff_session';

/**
 * Opciones de la cookie (pregunta resuelta de la spec 001: token en cookie httpOnly).
 * - `httpOnly`: el JavaScript de la página no puede leerla.
 * - `sameSite: 'strict'`: el navegador no la envía desde otras webs (protege de CSRF).
 * - `secure` solo en la nube: en el local el panel va por http en la LAN, y con `secure` el
 *   navegador no la enviaría.
 */
export function staffCookieOptions(config: AppConfig, expires: Date): CookieSerializeOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.mode === 'cloud',
    path: '/',
    expires,
  };
}
