import fastifyCookie from '@fastify/cookie';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

/**
 * Configuración de la aplicación que no cabe en los módulos de NestJS: plugins de Fastify.
 * La usan `main.ts` y los tests e2e, para probar lo mismo que se ejecuta.
 */
export async function configureApp(app: NestFastifyApplication): Promise<void> {
  // Lee y escribe cookies: la sesión del personal va en una (REQ-001-40).
  await app.register(fastifyCookie);
}
