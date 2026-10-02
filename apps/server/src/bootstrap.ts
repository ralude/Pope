import { stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

export interface AppOptions {
  /**
   * Carpeta del panel compilado (`apps/panel/dist`) que sirve el nodo local (T45a). Sin ella
   * no se sirve el panel: la nube y los tests que no lo necesitan.
   */
  panelDir?: string | null;
}

/**
 * Configuración de la aplicación que no cabe en los módulos de NestJS: plugins de Fastify.
 * La usan `main.ts` y los tests e2e, para probar lo mismo que se ejecuta.
 */
export async function configureApp(
  app: NestFastifyApplication,
  options: AppOptions = {},
): Promise<void> {
  // Lee y escribe cookies: la sesión del personal va en una (REQ-001-40).
  await app.register(fastifyCookie);
  if (options.panelDir) {
    await servePanel(app, resolve(options.panelDir));
  }
}

/** ¿Es un archivo de dentro de la carpeta? Nada de `..` para salir de ella. */
async function isFileInside(dir: string, path: string): Promise<boolean> {
  const full = resolve(dir, path);
  const inside = relative(dir, full);
  if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) {
    return false;
  }
  try {
    return (await stat(full)).isFile();
  } catch {
    return false;
  }
}

/**
 * Sirve el panel compilado desde el propio nodo (T45a, ADR-0011): el encargado lo abre en el
 * navegador sin instalar nada. Las rutas de la API tienen prioridad, porque Fastify prefiere
 * siempre una ruta concreta a un comodín. Cualquier otra dirección devuelve el archivo si
 * existe y, si no, `index.html`, para que funcionen las rutas del panel (wouter). Una
 * petición que no es de un navegador recibe un 404 en JSON, como el resto de la API.
 */
async function servePanel(app: NestFastifyApplication, dir: string): Promise<void> {
  // Solo para `reply.sendFile`: las rutas las pone el comodín de abajo.
  await app.register(fastifyStatic, { root: dir, serve: false });
  const fastify = app.getHttpAdapter().getInstance();
  fastify.get('/*', async (request, reply) => {
    const path = (request.params as { '*'?: string })['*'] ?? '';
    if (path && (await isFileInside(dir, path))) {
      // Vite pone un hash en el nombre de lo que hay en `assets/`: no cambia nunca.
      const immutable = path.startsWith('assets/');
      return reply.sendFile(path, {
        maxAge: immutable ? '1y' : 0,
        immutable,
      });
    }
    if (!(request.headers.accept ?? '').includes('text/html')) {
      return reply
        .code(404)
        .send({ message: `Cannot GET ${request.url}`, error: 'Not Found', statusCode: 404 });
    }
    // Sin caché: tras actualizar el nodo, el navegador pide el panel nuevo.
    return reply
      .header('cache-control', 'no-cache')
      .sendFile('index.html', { cacheControl: false });
  });
}
