import { describe, expect, it, vi } from 'vitest';

import { ApiClient } from '../api/client.js';
import { codeClock, installationErrorMessage, requestInstallationCode } from './installation.js';

const ID = '01900000-0000-7000-8000-000000000001';
const PC = '01900000-0000-7000-8000-000000000004';
const ANSWER = { id: ID, code: 'A'.repeat(22), expiresAt: '2026-10-22T20:10:00.000Z' };

function fakeFetch(body: unknown) {
  const calls: { url: string; body: unknown }[] = [];
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    });
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

describe('código de instalación (REQ-003-10, CA-003-11)', () => {
  it('sin PC pide un código para una PC nueva; con PC, para registrarla de nuevo', async () => {
    const fresh = fakeFetch(ANSWER);
    expect(await requestInstallationCode(new ApiClient({ fetch: fresh.fn }))).toEqual(ANSWER);
    expect(fresh.calls[0]).toEqual({ url: '/pcs/installation-codes', body: {} });
    const again = fakeFetch(ANSWER);
    await requestInstallationCode(new ApiClient({ fetch: again.fn }), PC);
    expect(again.calls[0]?.body).toEqual({ pcId: PC });
  });

  it('una respuesta con otra forma, o con un secreto de más, se rechaza', async () => {
    const bad = fakeFetch({ ...ANSWER, credential: 'x' });
    await expect(requestInstallationCode(new ApiClient({ fetch: bad.fn }))).rejects.toThrow();
  });

  it('la cuenta atrás llega a los 10 min y después marca caducado', () => {
    const expiresAt = ANSWER.expiresAt;
    expect(codeClock(expiresAt, new Date('2026-10-22T20:00:00Z'))).toEqual({
      expired: false,
      text: '10:00',
      secondsLeft: 600,
    });
    expect(codeClock(expiresAt, new Date('2026-10-22T20:09:55Z'))).toMatchObject({ text: '0:05' });
    expect(codeClock(expiresAt, new Date('2026-10-22T20:10:00Z'))).toEqual({ expired: true });
    expect(codeClock(expiresAt, new Date('2026-10-22T21:00:00Z'))).toEqual({ expired: true });
  });

  it('explica por qué no se puede registrar de nuevo una PC', () => {
    expect(installationErrorMessage('pc_unavailable', 'x')).toMatch(/libre y sin mantenimiento/);
    expect(installationErrorMessage('unknown_pc', 'x')).toBe('La PC no existe.');
    expect(installationErrorMessage(null, 'Del nodo')).toBe('Del nodo');
  });
});
