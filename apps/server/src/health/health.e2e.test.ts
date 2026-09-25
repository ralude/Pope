import { afterEach, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from '../testing/app.js';

describe('GET /health (e2e)', () => {
  let testApp: TestApp | undefined;

  afterEach(async () => {
    await testApp?.close();
    testApp = undefined;
  });

  it('responde ok con el modo local, sin sesión del personal', async () => {
    testApp = await createTestApp('local');
    const response = await testApp.app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', mode: 'local' });
  });

  it('responde ok con el modo nube', async () => {
    testApp = await createTestApp('cloud');
    const response = await testApp.app.inject({ method: 'GET', url: '/health' });
    expect(response.json()).toEqual({ status: 'ok', mode: 'cloud' });
  });
});
