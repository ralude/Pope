import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  type LockBackgroundSnapshot,
  lockBackgroundSnapshotSchema,
  MAX_BACKGROUND_BYTES,
} from '@pope/shared';
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { events, lockScreenBackground, pcs } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';
import { seedDevPcs } from '../pcs/dev-pcs.js';
import { createTestApp, type TestApp } from '../testing/app.js';
import { loginAsStaff } from '../testing/auth.js';
import { listenForPcs, PcTestClient } from '../testing/pc-client.js';
import { testPcCredentials } from '../testing/pc-credentials.js';

/**
 * Un WebP lossless (VP8L) mínimo armado a mano: el ancho y el alto van en 14 bits cada uno
 * tras la firma 0x2f, así que las dimensiones esperadas no salen del código que se prueba.
 */
function webp(width: number, height: number, size = 36): Buffer {
  const header = Buffer.alloc(5);
  header[0] = 0x2f;
  const bits = (width - 1) | ((height - 1) << 14);
  header.writeUInt32LE(bits >>> 0, 1);
  // `size` es el tamaño total del archivo: lo que sobra de la cabecera se rellena de ceros.
  const chunk = Buffer.concat([header, Buffer.alloc(size - 20 - header.length)]);
  const body = Buffer.alloc(12 + 8 + chunk.length);
  body.write('RIFF', 0, 'ascii');
  body.writeUInt32LE(body.length - 8, 4);
  body.write('WEBP', 8, 'ascii');
  body.write('VP8L', 12, 'ascii');
  body.writeUInt32LE(chunk.length, 16);
  chunk.copy(body, 20);
  return body;
}

/** Envuelve un bloque en la cabecera RIFF/WEBP. */
function riff(fourCc: string, data: Buffer): Buffer {
  const body = Buffer.alloc(20 + data.length);
  body.write('RIFF', 0, 'ascii');
  body.writeUInt32LE(body.length - 8, 4);
  body.write('WEBP', 8, 'ascii');
  body.write(fourCc, 12, 'ascii');
  body.writeUInt32LE(data.length, 16);
  data.copy(body, 20);
  return body;
}

/** WebP con pérdida (VP8): etiqueta de fotograma, código de inicio 9d 01 2a, ancho y alto en 16 bits. */
function webpLossy(width: number, height: number): Buffer {
  const data = Buffer.alloc(16);
  Buffer.from([0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a]).copy(data, 0);
  data.writeUInt16LE(width, 6);
  data.writeUInt16LE(height, 8);
  return riff('VP8 ', data);
}

/** WebP extendido (VP8X): banderas, 3 bytes reservados y lienzo (ancho-1, alto-1) en 24 bits. */
function webpExtended(width: number, height: number): Buffer {
  const data = Buffer.alloc(10);
  data.writeUIntLE(width - 1, 4, 3);
  data.writeUIntLE(height - 1, 7, 3);
  return riff('VP8X', data);
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

  function upload(body: Buffer, cookie = admin, type = 'image/webp') {
    return testApp.app.inject({
      method: 'PUT',
      url: '/lock-background',
      headers: { cookie, 'content-type': type },
      payload: body,
    });
  }

  const eventCount = async () => (await testApp.database.db.select().from(events)).length;

  /** Un intento rechazado no deja revisión, evento ni archivo. */
  async function expectNothingChanged(eventsBefore: number) {
    expect(await testApp.database.db.select().from(lockScreenBackground)).toMatchObject([
      { revision: 0, sha256: null },
    ]);
    expect(await eventCount()).toBe(eventsBefore);
    await expect(readdir(join(testApp.dataDir, 'lock-background'))).rejects.toMatchObject({
      code: 'ENOENT',
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

  it('CA1: todo el personal, dueño incluido, consulta el fondo actual', async () => {
    const ana = await loginAsStaff(testApp, 'ana', 'encargado', 'Ana');
    const dueno = await loginAsStaff(testApp, 'dueno', 'dueno', 'Dueño');
    const get = (cookie?: string) =>
      testApp.app.inject({
        method: 'GET',
        url: '/lock-background',
        headers: cookie ? { cookie } : {},
      });

    // Antes de subir nada: el valor inicial, distinto de «se quitó el fondo».
    for (const cookie of [admin, ana, dueno]) {
      const response = await get(cookie);
      expect(response.statusCode).toBe(200);
      expect(lockBackgroundSnapshotSchema.parse(response.json())).toEqual({
        revision: 0,
        background: null,
        changedAt: null,
        changedBy: null,
      });
    }

    const uploaded = (await upload(webp(1280, 720))).json<LockBackgroundSnapshot>();
    for (const cookie of [admin, ana, dueno]) {
      const response = await get(cookie);
      expect(response.statusCode).toBe(200);
      expect(lockBackgroundSnapshotSchema.parse(response.json())).toEqual(uploaded);
    }
    expect((await get()).statusCode).toBe(401);
  });

  it('CA3: la PC descarga la imagen con su credencial; sin ella, 401; sin esa huella, 404', async () => {
    const [credential = ''] = (await testPcCredentials(testApp)).values();
    const body = webp(1280, 720);
    const sha256 = createHash('sha256').update(body).digest('hex');
    const download = (hash: string, headers: Record<string, string> = {}) =>
      testApp.app.inject({ method: 'GET', url: `/lock-background/image/${hash}`, headers });
    const asPc = { authorization: `Bearer ${credential}` };

    // Sin ningún fondo guardado.
    expect((await download(sha256, asPc)).statusCode).toBe(404);

    await upload(body);

    const response = await download(sha256, asPc);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/webp');
    expect(response.rawPayload).toEqual(body);

    // Sin credencial, o con la sesión del personal pero no la de una PC, no se descarga.
    const missing = await download(sha256);
    expect(missing.statusCode).toBe(401);
    expect(missing.json()).toEqual({
      code: 'missing_pc_credential',
      message: 'Falta la credencial de la PC',
    });
    expect((await download(sha256, { cookie: admin })).statusCode).toBe(401);
    const wrong = await download(sha256, { authorization: `Bearer ${'A'.repeat(42)}A` });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toMatchObject({ code: 'invalid_pc_credential' });

    // Otra huella, o un nombre que no es una huella (nada de rutas), no llega al disco.
    expect((await download('b'.repeat(64), asPc)).statusCode).toBe(404);
    expect((await download('..%2F..%2Fsecreto', asPc)).statusCode).toBe(400);
    expect((await download('A'.repeat(64), asPc)).statusCode).toBe(400);
  });

  it('CA3: subir un fondo avisa a las PCs conectadas, solo con metadatos', async () => {
    await seedDevPcs(testApp.database.db, 2);
    const url = await listenForPcs(testApp);
    const pcIds = (await testApp.database.db.select({ id: pcs.id }).from(pcs)).map((pc) => pc.id);
    expect(pcIds).toHaveLength(2);
    const connected = await Promise.all(pcIds.map((id) => PcTestClient.hello(url, id)));
    const body = webp(1280, 720);
    const sha256 = createHash('sha256').update(body).digest('hex');

    expect((await upload(body)).statusCode).toBe(200);

    for (const { pc } of connected) {
      // Al conectar pudo llegar ya el aviso del valor inicial: se espera el de la revisión 1.
      await vi.waitFor(() => {
        expect(pc.backgrounds.at(-1)?.revision).toBe(1);
      });
      expect(pc.backgrounds.at(-1)).toEqual({
        type: 'lockBackground',
        revision: 1,
        background: { sha256, size: body.length, mimeType: 'image/webp', width: 1280, height: 720 },
      });
      pc.close();
    }
  });

  it('CA3: tras el hello la PC recibe el fondo que le toca, también la que estaba apagada', async () => {
    await seedDevPcs(testApp.database.db, 2);
    const url = await listenForPcs(testApp);
    const [first = '', second = ''] = (
      await testApp.database.db.select({ id: pcs.id }).from(pcs)
    ).map((pc) => pc.id);
    const body = webp(1280, 720);
    const sha256 = createHash('sha256').update(body).digest('hex');

    // Con el valor inicial: revisión 0 y sin imagen.
    const { pc: early } = await PcTestClient.hello(url, first);
    await vi.waitFor(() => {
      expect(early.backgrounds).toEqual([
        { type: 'lockBackground', revision: 0, background: null },
      ]);
    });

    // La segunda PC está apagada cuando se sube el fondo y se entera al conectar.
    expect((await upload(body)).statusCode).toBe(200);
    const { pc: late } = await PcTestClient.hello(url, second);
    await vi.waitFor(() => {
      expect(late.backgrounds).toEqual([
        {
          type: 'lockBackground',
          revision: 1,
          background: {
            sha256,
            size: body.length,
            mimeType: 'image/webp',
            width: 1280,
            height: 720,
          },
        },
      ]);
    });
    early.close();
    late.close();
  });

  it('CA1: sustituir el fondo borra el archivo anterior y deja solo el actual', async () => {
    const first = webp(1280, 720);
    const second = webp(800, 600, 40);
    const secondName = `${createHash('sha256').update(second).digest('hex')}.webp`;
    const filesOnDisk = () => readdir(join(testApp.dataDir, 'lock-background'));

    await upload(first);
    expect(await filesOnDisk()).toHaveLength(1);

    expect((await upload(second)).statusCode).toBe(200);
    expect(await filesOnDisk()).toEqual([secondName]);

    // Volver a subir la misma imagen no borra su propio archivo.
    const again = await upload(second);
    expect(again.statusCode).toBe(200);
    expect(again.json<LockBackgroundSnapshot>().revision).toBe(3);
    expect(await filesOnDisk()).toEqual([secondName]);
  });

  it('CA1: el encargado y el dueño no pueden cambiar el fondo', async () => {
    const ana = await loginAsStaff(testApp, 'ana', 'encargado', 'Ana');
    const dueno = await loginAsStaff(testApp, 'dueno', 'dueno', 'Dueño');
    const eventsBefore = await eventCount();

    for (const cookie of [ana, dueno]) {
      expect((await upload(webp(1280, 720), cookie)).statusCode).toBe(403);
    }

    await expectNothingChanged(eventsBefore);
  });

  it('CA2: un cuerpo que no es WebP se rechaza con 415 y el motivo en español', async () => {
    const eventsBefore = await eventCount();
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

    const asWebp = await upload(png);
    // Con otro Content-Type responde Fastify antes del controlador: solo se comprueba el 415.
    const asPng = await upload(png, admin, 'image/png');

    expect(asWebp.statusCode).toBe(415);
    expect(asWebp.json<{ message: string }>().message).toBe('El fondo debe ser una imagen WebP');
    expect(asPng.statusCode).toBe(415);
    await expectNothingChanged(eventsBefore);
  });

  it('CA1: acepta WebP con pérdida (VP8) y extendido (VP8X), los que genera el navegador', async () => {
    const lossy = await upload(webpLossy(1600, 900));
    const extended = await upload(webpExtended(1024, 768));

    expect(lossy.statusCode).toBe(200);
    expect(lossy.json<LockBackgroundSnapshot>()).toMatchObject({
      revision: 1,
      background: { width: 1600, height: 900 },
    });
    expect(extended.statusCode).toBe(200);
    expect(extended.json<LockBackgroundSnapshot>()).toMatchObject({
      revision: 2,
      background: { width: 1024, height: 768 },
    });
  });

  it('CA2: si falla la transacción no queda revisión ni evento, y se borra el archivo huérfano', async () => {
    const current = webp(1280, 720);
    const currentName = `${createHash('sha256').update(current).digest('hex')}.webp`;
    expect((await upload(current)).statusCode).toBe(200);
    const eventsBefore = await eventCount();

    // La transacción real hace sus cambios y emite el evento; después falla y debe deshacerlo todo.
    const eventsService = testApp.app.get(EventsService);
    const real = eventsService.inTransaction.bind(eventsService);
    vi.spyOn(eventsService, 'inTransaction').mockImplementation((work) =>
      real(async (tx, emit) => {
        await work(tx, emit);
        throw new Error('fallo simulado tras emitir');
      }),
    );

    const other = webp(800, 600, 40);
    const otherName = `${createHash('sha256').update(other).digest('hex')}.webp`;
    // Una imagen distinta y la misma que ya está en uso: solo la primera deja un huérfano.
    expect((await upload(other)).statusCode).toBe(500);
    expect((await upload(current)).statusCode).toBe(500);

    expect(await testApp.database.db.select().from(lockScreenBackground)).toMatchObject([
      { revision: 1, width: 1280, height: 720 },
    ]);
    expect(await eventCount()).toBe(eventsBefore);
    const files = await readdir(join(testApp.dataDir, 'lock-background'));
    expect(files).toContain(currentName);
    expect(files).not.toContain(otherName);
    expect(files).toHaveLength(1);
  });

  it('CA2: más de 2 MB se rechaza con 413 y no deja rastro; 2 MB justos se aceptan', async () => {
    const eventsBefore = await eventCount();

    // El parser de bootstrap.ts responde antes del controlador: solo se comprueba el 413.
    const tooBig = await upload(webp(1280, 720, MAX_BACKGROUND_BYTES + 1));
    expect(tooBig.statusCode).toBe(413);
    await expectNothingChanged(eventsBefore);

    const limit = await upload(webp(1280, 720, MAX_BACKGROUND_BYTES));
    expect(limit.statusCode).toBe(200);
    expect(limit.json<LockBackgroundSnapshot>()).toMatchObject({
      background: { size: MAX_BACKGROUND_BYTES },
    });
  });

  it('CA2: más de 1920×1080 se rechaza con invalid_image y no deja rastro', async () => {
    const eventsBefore = await eventCount();

    for (const body of [webp(1921, 1080), webp(1920, 1081), webpLossy(4000, 3000)]) {
      const response = await upload(body);
      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({
        code: 'invalid_image',
        message: 'La imagen supera 1920×1080 píxeles',
      });
    }
    await expectNothingChanged(eventsBefore);
  });

  it('CA2: un WebP corrupto se rechaza con invalid_image y no deja rastro', async () => {
    const eventsBefore = await eventCount();
    const onlyHeader = webp(1280, 720).subarray(0, 12);
    const truncated = webp(1280, 720).subarray(0, 22);
    const badSignature = webp(1280, 720);
    badSignature[20] = 0x00;
    const unknownChunk = webp(1280, 720);
    unknownChunk.write('JUNK', 12, 'ascii');

    for (const body of [onlyHeader, truncated, badSignature, unknownChunk]) {
      const response = await upload(body);
      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({
        code: 'invalid_image',
        message: 'La imagen está dañada o no se puede leer',
      });
    }
    await expectNothingChanged(eventsBefore);
  });
});
