import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type LockBackgroundSnapshot } from '@pope/shared';
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { events, lockScreenBackground } from '../db/schema.js';
import { createTestApp, type TestApp } from '../testing/app.js';
import { loginAsStaff } from '../testing/auth.js';

/**
 * Un WebP lossless (VP8L) mínimo armado a mano: el ancho y el alto van en 14 bits cada uno
 * tras la firma 0x2f, así que las dimensiones esperadas no salen del código que se prueba.
 */
function webp(width: number, height: number, fill = 0): Buffer {
  const header = Buffer.alloc(5);
  header[0] = 0x2f;
  const bits = (width - 1) | ((height - 1) << 14);
  header.writeUInt32LE(bits >>> 0, 1);
  const chunk = Buffer.concat([header, Buffer.alloc(11, fill)]);
  const body = Buffer.alloc(12 + 8 + chunk.length);
  body.write('RIFF', 0, 'ascii');
  body.writeUInt32LE(body.length - 8, 4);
  body.write('WEBP', 8, 'ascii');
  body.write('VP8L', 12, 'ascii');
  body.writeUInt32LE(chunk.length, 16);
  chunk.copy(body, 20);
  return body;
}

describe('fondo global de bloqueo (e2e, REQ-003-70, REQ-003-71, REQ-003-76)', () => {
  let testApp: TestApp;
  let admin: string;

  beforeEach(async () => {
    testApp = await createTestApp('local');
    admin = await loginAsStaff(testApp, 'admin', 'administrador', 'Luis');
  });

  afterEach(async () => {
    await testApp.close();
  });

  function upload(body: Buffer, cookie = admin) {
    return testApp.app.inject({
      method: 'PUT',
      url: '/lock-background',
      headers: { cookie, 'content-type': 'image/webp' },
      payload: body,
    });
  }

  it('CA1: el administrador sube un WebP válido y queda como el fondo actual', async () => {
    const body = webp(1280, 720);
    const sha256 = createHash('sha256').update(body).digest('hex');

    const response = await upload(body);

    expect(response.statusCode).toBe(200);
    const snapshot = response.json<LockBackgroundSnapshot>();
    expect(snapshot).toMatchObject({
      revision: 1,
      background: {
        sha256,
        size: body.length,
        mimeType: 'image/webp',
        width: 1280,
        height: 720,
      },
      changedBy: { kind: 'staff', name: 'Luis' },
    });
    expect(await readdir(join(testApp.dataDir, 'lock-background'))).toEqual([`${sha256}.webp`]);
    expect(await readFile(join(testApp.dataDir, 'lock-background', `${sha256}.webp`))).toEqual(
      body,
    );
    expect(
      (await testApp.database.db.select().from(events).orderBy(asc(events.seq))).at(-1),
    ).toMatchObject({
      type: 'lock_screen.background_changed',
      actor: { kind: 'staff', name: 'Luis' },
      payload: { revision: 1, background: { sha256, width: 1280, height: 720 } },
    });
  });

  it('CA1: el encargado y el dueño no pueden cambiar el fondo', async () => {
    const ana = await loginAsStaff(testApp, 'ana', 'encargado', 'Ana');
    const dueno = await loginAsStaff(testApp, 'dueno', 'dueno', 'Dueño');
    const eventsBefore = await testApp.database.db.select().from(events);

    for (const cookie of [ana, dueno]) {
      expect((await upload(webp(1280, 720), cookie)).statusCode).toBe(403);
    }

    expect(await testApp.database.db.select().from(lockScreenBackground)).toMatchObject([
      { revision: 0, sha256: null },
    ]);
    expect(await testApp.database.db.select().from(events)).toHaveLength(eventsBefore.length);
    await expect(readdir(join(testApp.dataDir, 'lock-background'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
