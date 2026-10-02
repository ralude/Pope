import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from './testing/app.js';

const HTML = { accept: 'text/html,application/xhtml+xml' };

describe('el nodo sirve el panel compilado (e2e, T45a, ADR-0011)', () => {
  let dir: string;
  let testApp: TestApp;

  beforeAll(async () => {
    // Un panel compilado de prueba, como el que deja Vite en apps/panel/dist.
    dir = await mkdtemp(join(tmpdir(), 'pope-panel-'));
    await writeFile(join(dir, 'index.html'), '<!doctype html><title>Pope panel</title>');
    await mkdir(join(dir, 'assets'));
    await writeFile(join(dir, 'assets', 'index-abc123.js'), 'console.log("panel");');
    testApp = await createTestApp('local', [], { panelDir: dir });
  });

  afterAll(async () => {
    await testApp.close();
    await rm(dir, { recursive: true, force: true });
  });

  const get = (url: string, headers: Record<string, string> = HTML) =>
    testApp.app.inject({ method: 'GET', url, headers });

  it('/ devuelve el panel, sin caché', async () => {
    const response = await get('/');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.body).toContain('Pope panel');
  });

  it('las rutas del panel (/clientes, /combo-horas) también devuelven el panel', async () => {
    for (const url of ['/clientes', '/combo-horas', '/interrumpidas?x=1']) {
      const response = await get(url);
      expect(response.statusCode, url).toBe(200);
      expect(response.body, url).toContain('Pope panel');
    }
  });

  it('sirve los archivos del panel, con caché larga los de assets/', async () => {
    const response = await get('/assets/index-abc123.js', {});
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('javascript');
    expect(response.headers['cache-control']).toContain('immutable');
  });

  it('las rutas de la API tienen prioridad', async () => {
    const health = await get('/health');
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: 'ok' });
    // /combos es de la API: sin sesión del personal, 401 en JSON y no el panel.
    const combos = await get('/combos');
    expect(combos.statusCode).toBe(401);
    expect(combos.headers['content-type']).toContain('application/json');
  });

  it('lo que no existe y no pide un navegador es un 404 en JSON', async () => {
    const response = await get('/no-existe', { accept: 'application/json' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ statusCode: 404 });
  });

  it('no sale de la carpeta del panel', async () => {
    const response = await get('/%2e%2e/%2e%2e/package.json', { accept: '*/*' });
    expect(response.statusCode).toBe(404);
  });
});

describe('sin panel compilado (nube o tests)', () => {
  it('no sirve nada fuera de la API', async () => {
    const testApp = await createTestApp('cloud');
    try {
      const response = await testApp.app.inject({ method: 'GET', url: '/', headers: HTML });
      expect(response.statusCode).toBe(404);
    } finally {
      await testApp.close();
    }
  });
});
