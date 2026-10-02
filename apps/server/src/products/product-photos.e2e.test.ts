import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { PRODUCT_PHOTO_MAX_BYTES, type Product, productPhotoPath, usd } from '@pope/shared';
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events } from '../db/schema.js';
import { createTestApp, type TestApp } from '../testing/app.js';
import { loginAsStaff } from '../testing/auth.js';

/** Un WebP mínimo: cabecera RIFF/WEBP y unos bytes de relleno distintos en cada foto. */
function webp(fill: number, size = 64): Buffer {
  const body = Buffer.alloc(size, fill);
  body.write('RIFF', 0, 'ascii');
  body.writeUInt32LE(size - 8, 4);
  body.write('WEBP', 8, 'ascii');
  return body;
}

describe('fotos de los productos (e2e, REQ-005-03, REQ-005-73)', () => {
  let testApp: TestApp;
  let admin: string;
  let ana: string;
  let dueno: string;
  let product: Product;

  beforeEach(async () => {
    testApp = await createTestApp('local');
    admin = await loginAsStaff(testApp, 'admin', 'administrador', 'Luis');
    ana = await loginAsStaff(testApp, 'ana', 'encargado', 'Ana');
    dueno = await loginAsStaff(testApp, 'dueno', 'dueno', 'Dueño');
    product = (
      await testApp.app.inject({
        method: 'POST',
        url: '/products',
        headers: { cookie: admin },
        payload: { name: 'Doritos', priceMicros: usd(1.5), minStock: null, initialQuantity: 24 },
      })
    ).json<Product>();
  });

  afterEach(async () => {
    await testApp.close();
  });

  function upload(body: Buffer, cookie = admin, type = 'image/webp') {
    return testApp.app.inject({
      method: 'PUT',
      url: `/products/${product.id}/photo`,
      headers: { cookie, 'content-type': type },
      payload: body,
    });
  }

  const photoFiles = () => readdir(join(testApp.dataDir, 'products'));

  it('CA-005-08: el administrador sube la foto y el personal la ve, con caché larga', async () => {
    const response = await upload(webp(1));
    expect(response.statusCode).toBe(200);
    const updated = response.json<Product>();
    expect(updated.photoVersion).toMatch(/^[0-9a-f]{12}$/);
    expect(updated.stock).toBe(24);
    expect(
      (await testApp.database.db.select().from(events).orderBy(asc(events.seq))).at(-1),
    ).toMatchObject({
      type: 'product.photo_set',
      actor: { kind: 'staff', name: 'Luis' },
      payload: { product: { id: product.id, name: 'Doritos' } },
    });

    const path = productPhotoPath(updated);
    expect(path).not.toBeNull();
    const photo = await testApp.app.inject({
      method: 'GET',
      url: path ?? '',
      headers: { cookie: ana },
    });
    expect(photo.statusCode).toBe(200);
    expect(photo.headers['content-type']).toBe('image/webp');
    expect(photo.headers['cache-control']).toContain('immutable');
    expect(photo.rawPayload.equals(webp(1))).toBe(true);
    // La lista ya trae la versión de la foto.
    const listed = (
      await testApp.app.inject({ method: 'GET', url: '/products', headers: { cookie: dueno } })
    ).json<Product[]>();
    expect(listed[0]?.photoVersion).toBe(updated.photoVersion);
  });

  it('una foto nueva cambia la versión y borra la anterior del disco', async () => {
    const first = (await upload(webp(1))).json<Product>();
    const second = (await upload(webp(2))).json<Product>();
    expect(second.photoVersion).not.toBe(first.photoVersion);
    expect(await photoFiles()).toEqual([`${product.id}-${second.photoVersion ?? ''}.webp`]);
  });

  it('la misma foto otra vez no emite otro evento', async () => {
    await upload(webp(1));
    const before = (await testApp.database.db.select().from(events)).length;
    await upload(webp(1));
    expect(await testApp.database.db.select().from(events)).toHaveLength(before);
  });

  it('rechaza otro tipo (415) y más de 512 KB (413)', async () => {
    expect((await upload(webp(1), admin, 'image/png')).statusCode).toBe(415);
    expect((await upload(Buffer.from('no es una foto'), admin)).statusCode).toBe(415);
    expect((await upload(webp(1, PRODUCT_PHOTO_MAX_BYTES + 1))).statusCode).toBe(413);
    expect((await upload(webp(1, PRODUCT_PHOTO_MAX_BYTES))).statusCode).toBe(200);
  });

  it('solo el administrador sube fotos', async () => {
    expect((await upload(webp(1), ana)).statusCode).toBe(403);
    expect((await upload(webp(1), dueno)).statusCode).toBe(403);
  });

  it('sin foto responde 404, y sin sesión 401', async () => {
    const url = `/products/${product.id}/photo`;
    expect(
      (await testApp.app.inject({ method: 'GET', url, headers: { cookie: ana } })).statusCode,
    ).toBe(404);
    await upload(webp(1));
    expect((await testApp.app.inject({ method: 'GET', url })).statusCode).toBe(401);
  });
});
