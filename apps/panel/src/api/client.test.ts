import { staffProfileSchema } from '@pope/shared';
import { describe, expect, it, vi } from 'vitest';

import {
  ApiClient,
  ApiError,
  listOf,
  NETWORK_ERROR,
  SESSION_EXPIRED,
  UNEXPECTED_RESPONSE,
} from './client.js';

const ANA = {
  id: '01900000-0000-7000-8000-0000000000aa',
  username: 'ana',
  displayName: 'Ana',
  role: 'encargado',
};

/** `fetch` falso que responde siempre lo mismo y apunta cada llamada. */
function fakeFetch(status: number, body?: unknown) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
    return Promise.resolve(new Response(status === 204 ? null : text, { status }));
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) {
      return error;
    }
    throw error;
  }
  throw new Error('Se esperaba un ApiError');
}

describe('cliente de la API del panel (REQ-001-40)', () => {
  it('devuelve la respuesta validada con el esquema de shared', async () => {
    const { fn, calls } = fakeFetch(200, ANA);
    const client = new ApiClient({ fetch: fn });

    await expect(client.get('/auth/me', staffProfileSchema)).resolves.toEqual(ANA);
    expect(calls[0]?.url).toBe('/auth/me');
    expect(calls[0]?.init).toMatchObject({ method: 'GET', credentials: 'same-origin', body: null });
  });

  it('envía el cuerpo como JSON y solo entonces pone el content-type', async () => {
    const { fn, calls } = fakeFetch(200, ANA);
    const client = new ApiClient({ fetch: fn });

    await client.post('/auth/login', { username: 'ana', password: 'x' }, staffProfileSchema);
    await client.send('POST', '/auth/logout');

    expect(calls[0]?.init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"username":"ana","password":"x"}',
    });
    expect(calls[1]?.init).toMatchObject({ method: 'POST', headers: {}, body: null });
  });

  it('un 204 no necesita cuerpo', async () => {
    const { fn } = fakeFetch(204);
    await expect(
      new ApiClient({ fetch: fn }).send('POST', '/auth/logout'),
    ).resolves.toBeUndefined();
  });

  it('un 401 fuera del login avisa de que la sesión caducó', async () => {
    const onUnauthorized = vi.fn();
    const { fn } = fakeFetch(401, { statusCode: 401, message: 'Inicia sesión para continuar' });
    const client = new ApiClient({ fetch: fn, onUnauthorized });

    const error = await caught(client.get('/auth/me', staffProfileSchema));

    expect(error.status).toBe(401);
    expect(error.message).toBe('Inicia sesión para continuar');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('el 401 del login es "usuario o contraseña incorrectos" y no cierra nada', async () => {
    const onUnauthorized = vi.fn();
    const { fn } = fakeFetch(401, { statusCode: 401, message: 'Usuario o contraseña incorrectos' });
    const client = new ApiClient({ fetch: fn, onUnauthorized });

    const error = await caught(client.post('/auth/login', {}, staffProfileSchema));

    expect(error.message).toBe('Usuario o contraseña incorrectos');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('usa el mensaje del nodo y los problemas de cada campo', async () => {
    const { fn } = fakeFetch(400, {
      message: 'Datos no válidos',
      issues: [{ path: 'username', message: 'Obligatorio' }, { nada: 1 }],
    });
    const error = await caught(
      new ApiClient({ fetch: fn }).post('/customers', {}, staffProfileSchema),
    );

    expect(error.message).toBe('Datos no válidos');
    expect(error.issues).toEqual([{ path: 'username', message: 'Obligatorio' }]);
  });

  it('junta los mensajes en lista y, sin mensaje, usa uno por código', async () => {
    const list = fakeFetch(409, { message: ['Uno', 'Dos'] });
    expect((await caught(new ApiClient({ fetch: list.fn }).send('POST', '/x'))).message).toBe(
      'Uno. Dos',
    );

    const empty = fakeFetch(403, 'no es json');
    expect((await caught(new ApiClient({ fetch: empty.fn }).send('POST', '/x'))).message).toBe(
      'No tienes permiso para hacer esto.',
    );

    const unknown = fakeFetch(401, '');
    expect((await caught(new ApiClient({ fetch: unknown.fn }).send('GET', '/x'))).message).toBe(
      SESSION_EXPIRED,
    );
  });

  it('una respuesta que no cumple el esquema es un error, no datos falsos', async () => {
    const { fn } = fakeFetch(200, { id: 'no-es-un-id', username: 'ana' });
    const error = await caught(new ApiClient({ fetch: fn }).get('/auth/me', staffProfileSchema));
    expect(error.message).toBe(UNEXPECTED_RESPONSE);
  });

  it('si el nodo no responde, lo dice', async () => {
    const fn = (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
    const error = await caught(new ApiClient({ fetch: fn }).get('/auth/me', staffProfileSchema));
    expect(error).toMatchObject({ status: 0, message: NETWORK_ERROR });
  });
});

describe('listOf', () => {
  it('valida cada elemento de la lista', () => {
    const schema = listOf(staffProfileSchema);
    expect(schema.safeParse([ANA])).toEqual({ success: true, data: [ANA] });
    expect(schema.safeParse([])).toEqual({ success: true, data: [] });
    expect(schema.safeParse([ANA, { id: 'x' }]).success).toBe(false);
    expect(schema.safeParse(ANA).success).toBe(false);
  });
});
