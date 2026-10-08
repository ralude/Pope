// Casos sintéticos con expectativas explícitas; no credenciales reales (REQ-003-63).
export interface ProtocolFixture {
  id: string;
  version: 'v1' | 'v2';
  contract: string;
  valid: boolean;
  input: unknown;
  normalizedUsername?: string;
}

export function protocolFixtures(): ProtocolFixture[] {
  const fixtures: ProtocolFixture[] = [];
  const id = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
  const time = '2026-10-07T12:00:00.000Z';
  const actor = { kind: 'staff', staffId: id, name: 'Prueba' };
  const free = { kind: 'free', revision: id };
  const busy = { kind: 'session', revision: id, sessionId: id };
  const pc = { id, name: 'PC de prueba', macAddress: '02:11:22:33:44:55' };
  const code = 'A'.repeat(22);
  const credential = 'A'.repeat(43);
  const money = { micros: 1_000_000, currency: 'USD' };
  const image = {
    sha256: 'a'.repeat(64),
    size: 2_000_000,
    mimeType: 'image/webp',
    width: 1920,
    height: 1080,
  };
  const command = {
    id,
    pcId: id,
    actor,
    expected: free,
    issuedAt: time,
    expiresAt: '2026-10-07T12:00:30.000Z',
    action: { kind: 'lock' },
  };
  const add = (
    version: 'v1' | 'v2',
    contracts: string[],
    name: string,
    valid: boolean,
    input: unknown,
    normalizedUsername?: string,
  ) => {
    for (const contract of contracts)
      fixtures.push({
        id: `${version}/${contract}/${name}`,
        version,
        contract,
        valid,
        input,
        ...(normalizedUsername === undefined ? {} : { normalizedUsername }),
      });
  };
  const incoming = ['pc-to-node', 'shell-request'];
  const outgoing = ['node-to-pc', 'shell-notification'];
  const clients = [
    { type: 'login', username: 'Ana', password: ' contraseña ' },
    { type: 'logout' },
    { type: 'buyCombo', comboId: id },
    { type: 'listCombos' },
    { type: 'pause' },
    { type: 'resume' },
  ];
  for (const input of clients) {
    add('v1', ['pc-to-node'], input.type, true, input);
    add('v2', incoming, input.type, true, input);
  }
  const hello = { type: 'hello', protocolVersion: 1, pcId: id, sessionId: null };
  add('v1', ['pc-to-node'], 'hello', true, hello);
  add('v1', ['pc-to-node'], 'heartbeat', true, {
    type: 'heartbeat',
    sessionId: null,
    localRemainingSeconds: null,
  });
  add('v1', ['pc-to-node'], 'hello-v2', false, { ...hello, protocolVersion: 2 });
  const nativeHello = {
    ...hello,
    protocolVersion: 2,
    pendingMaintenanceExitId: null,
    recoveryState: 'unknown',
    controlContext: null,
  };
  add('v2', ['pc-to-node'], 'hello-unknown', true, nativeHello);
  add('v2', ['pc-to-node'], 'hello-known', true, {
    ...nativeHello,
    recoveryState: 'known',
    controlContext: free,
  });
  add('v2', ['pc-to-node'], 'hello-wrong-version', false, { ...nativeHello, protocolVersion: 1 });
  add('v2', ['pc-to-node'], 'hello-unknown-session', false, { ...nativeHello, sessionId: id });
  add('v2', ['pc-to-node'], 'hello-secret', false, { ...nativeHello, credential });
  add('v2', ['pc-to-node'], 'heartbeat', true, {
    type: 'heartbeat',
    sessionId: id,
    localRemainingSeconds: 0,
    controlContext: busy,
  });
  add('v2', ['shell-request'], 'hello-not-shell', false, nativeHello);
  const technical = { type: 'technicalLogin', requestId: id, username: 'Ana', password: ' ' };
  add('v2', incoming, 'technical', true, technical);
  add('v2', incoming, 'technical-actor', false, { ...technical, actor });
  add('v2', ['shell-request'], 'end-maintenance', true, {
    type: 'endMaintenance',
    requestId: id,
    maintenanceId: id,
  });
  add('v2', ['pc-to-node'], 'end-maintenance-not-node', false, {
    type: 'endMaintenance',
    requestId: id,
    maintenanceId: id,
  });
  const exit = {
    type: 'maintenanceExit',
    exit: { id, maintenanceId: id, endedAt: time, durationSeconds: 0 },
  };
  add('v2', ['pc-to-node'], 'exit', true, exit);
  add('v2', ['shell-request'], 'exit-not-shell', false, exit);
  const ack = {
    type: 'commandAck',
    commandId: id,
    occurredAt: time,
    result: { status: 'accepted', kind: 'restart' },
  };
  add('v2', ['pc-to-node'], 'ack', true, ack);
  add('v2', ['shell-request'], 'ack-not-shell', false, ack);
  add('v2', ['pc-to-node'], 'restart-not-applied', false, {
    ...ack,
    result: { status: 'applied', effect: { kind: 'restart' } },
  });

  const account = {
    kind: 'account',
    sessionId: id,
    startedAt: time,
    username: 'Ana',
    ratePerHour: money,
    comboSeconds: 0,
    money,
    moneySeconds: 3600,
    remainingSeconds: 3600,
    pause: { startedAt: time, maxUntil: time, billing: false, secondsLeft: 0 },
    pausesLeft: 0,
    pauseLimit: 'day',
    pauseMaxSeconds: 900,
  };
  const messages = [
    { type: 'state', status: 'locked' },
    { type: 'state', status: 'active', session: account, vesRate: null },
    {
      type: 'state',
      status: 'active',
      session: {
        kind: 'temporary',
        sessionId: id,
        startedAt: time,
        name: 'Temporal',
        purchasedSeconds: 0,
        remainingSeconds: 0,
      },
      vesRate: 40_000_000,
    },
    { type: 'warning', sessionId: id, minutesLeft: 1 },
    { type: 'sessionEnded', sessionId: id, reason: 'exhausted' },
    { type: 'combos', combos: [{ comboId: id, name: 'Una hora', price: money, seconds: 3600 }] },
    { type: 'error', code: 'invalid_credentials', message: 'Datos incorrectos' },
  ];
  for (const [index, input] of messages.entries()) {
    add('v1', ['node-to-pc'], `message-${String(index)}`, true, input);
    add('v2', outgoing, `message-${String(index)}`, true, input);
  }
  add('v1', ['node-to-pc'], 'unknown-status', false, { type: 'state', status: 'inventado' });
  for (const context of [free, busy, { kind: 'maintenance', revision: id, maintenanceId: id }])
    add('v2', outgoing, `control-${context.kind}`, true, {
      type: 'controlState',
      context,
      serverTime: time,
    });
  for (const maintenance of [
    null,
    { id, pc: { id, name: pc.name }, actor, source: 'local', startedAt: time },
  ])
    add('v2', outgoing, `maintenance-${maintenance === null ? 'null' : 'active'}`, true, {
      type: 'maintenanceState',
      maintenance,
    });
  add('v2', outgoing, 'technical-error', true, {
    type: 'technicalError',
    requestId: id,
    code: 'forbidden',
    message: 'Sin permiso',
  });
  add('v2', outgoing, 'authentication-error', true, {
    type: 'pcAuthenticationError',
    code: 'pc_credential_revoked',
    message: 'Revocada',
  });
  add('v2', outgoing, 'background', true, {
    type: 'lockBackground',
    revision: 1,
    background: image,
  });
  add('v2', outgoing, 'background-default', true, {
    type: 'lockBackground',
    revision: 2,
    background: null,
  });
  for (const action of [
    { kind: 'lock' },
    { kind: 'restart' },
    { kind: 'powerOff' },
    { kind: 'showMessage', text: 'Aviso' },
    { kind: 'startMaintenance', maintenanceId: id, source: 'panel' },
    { kind: 'endMaintenance', maintenanceId: id, exitId: id },
  ]) {
    const input = { type: 'command', command: { ...command, action } };
    add('v2', ['node-to-pc'], `command-${action.kind}`, true, input);
    add('v2', ['shell-notification'], `command-${action.kind}`, false, input);
  }
  const exitAck = { type: 'maintenanceExitAcknowledged', exitId: id, maintenanceId: id };
  add('v2', ['node-to-pc'], 'exit-ack', true, exitAck);
  add('v2', ['shell-notification'], 'exit-ack-not-shell', false, exitAck);
  const progress = { type: 'backgroundProgress', revision: 1, stage: 'downloading', percent: 100 };
  add('v2', ['shell-notification'], 'progress', true, progress);
  add('v2', ['node-to-pc'], 'progress-not-node', false, progress);
  add('v2', ['shell-notification'], 'progress-too-large', false, { ...progress, percent: 101 });
  add('v2', ['shell-notification'], 'progress-decimal', false, { ...progress, percent: 0.5 });

  // Fronteras HTTP: expectativas decididas aquí, nunca derivadas de safeParse.
  const http: [string, unknown, unknown][] = [
    ['installation-code-request', {}, { actor }],
    [
      'installation-code-response',
      { id, code, expiresAt: time },
      { id, code: `${'A'.repeat(21)}B`, expiresAt: time },
    ],
    [
      'registration-request',
      { installationCode: code, macAddress: '02-11-22-33-44-55' },
      { installationCode: code, macAddress: '01:11:22:33:44:55' },
    ],
    [
      'registration-response',
      { pc, credential, protocolVersion: 2 },
      { pc: { ...pc, credential }, credential, protocolVersion: 2 },
    ],
    ['authorization-header', `Bearer ${credential}`, `Bearer ${credential}\r\n`],
    ['registered-pc', pc, { ...pc, credential }],
    [
      'command-request',
      { id, kind: 'restart', expected: busy, confirmed: true },
      { id, kind: 'restart', expected: busy },
    ],
    [
      'command-response',
      { command, status: 'requested', lastResult: null },
      { command, status: 'inventado', lastResult: null },
    ],
    [
      'background-snapshot',
      { revision: 0, background: null, changedAt: null, changedBy: null },
      { revision: 0, background: image, changedAt: null, changedBy: null },
    ],
  ];
  for (const [contract, valid, invalid] of http) {
    add('v2', [contract], 'valid', true, valid);
    add('v2', [contract], 'invalid', false, invalid);
  }
  for (const [contract, errorCode] of [
    ['registration-error', 'installation_code_expired'],
    ['authentication-error', 'pc_credential_revoked'],
    ['command-error', 'stale_context'],
    ['background-error', 'invalid_image'],
  ]) {
    if (contract === undefined || errorCode === undefined) throw new Error('Caso incompleto');
    add('v2', [contract], 'valid', true, { code: errorCode, message: 'Error de prueba' });
    add('v2', [contract], 'invalid', false, { code: 'inventado', message: 'Error de prueba' });
  }
  const snapshot = { revision: 1, background: image, changedAt: time, changedBy: actor };
  add('v2', ['background-snapshot'], 'changed', true, snapshot);
  add('v2', ['background-snapshot'], 'removed', true, { ...snapshot, background: null });
  for (const [name, background] of [
    ['size', { ...image, size: 2_000_001 }],
    ['width', { ...image, width: 1921 }],
    ['hash', { ...image, sha256: 'A'.repeat(64) }],
    ['mime', { ...image, mimeType: 'image/png' }],
  ] as const)
    add('v2', ['background-snapshot'], name, false, { ...snapshot, background });

  add('v2', outgoing, 'money-decimal', false, {
    type: 'state',
    status: 'active',
    session: { ...account, money: { ...money, micros: 0.1 } },
    vesRate: null,
  });
  add('v2', outgoing, 'money-unsafe', false, {
    type: 'state',
    status: 'active',
    session: { ...account, money: { ...money, micros: 9_007_199_254_740_992 } },
    vesRate: null,
  });
  add('v2', outgoing, 'money-extra', false, {
    type: 'state',
    status: 'active',
    session: { ...account, money: { ...money, password: 'prueba' } },
    vesRate: null,
  });
  add('v2', ['registration-response'], 'credential-padding-bits', false, {
    pc,
    credential: `${'A'.repeat(42)}B`,
    protocolVersion: 2,
  });
  add('v2', ['installation-code-response'], 'not-utc', false, {
    id,
    code,
    expiresAt: '2026-10-07T12:00:00+01:00',
  });
  add('v2', ['installation-code-response'], 'not-v7', false, {
    id: '00000000-0000-4000-8000-000000000000',
    code,
    expiresAt: time,
  });
  for (const result of [
    { status: 'applied', effect: { kind: 'lock' } },
    { status: 'failed', kind: 'lock', code: 'native_failure', message: 'Fallo de prueba' },
  ])
    add('v2', ['pc-to-node'], `ack-${result.status}`, true, { ...ack, result });
  for (const stage of ['verifying', 'ready'])
    add('v2', ['shell-notification'], stage, true, {
      type: 'backgroundProgress',
      revision: 1,
      stage,
    });
  add('v2', ['shell-notification'], 'progress-failed', true, {
    type: 'backgroundProgress',
    revision: 1,
    stage: 'failed',
    code: 'hash_mismatch',
  });

  // Reglas de longitud Unicode, contraseña intacta y recorte explícito del usuario.
  const trimPoints = [
    9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201,
    8202, 8232, 8233, 8239, 8287, 12288, 65279,
  ];
  for (const [version, contract, type] of [
    ['v1', 'pc-to-node', 'login'],
    ['v2', 'pc-to-node', 'login'],
    ['v2', 'shell-request', 'login'],
    ['v2', 'pc-to-node', 'technicalLogin'],
    ['v2', 'shell-request', 'technicalLogin'],
  ] as const) {
    const login = { type, requestId: id, username: 'Ana', password: ' \ufeffprueba\u0085 ' };
    for (const point of [...trimPoints, 0x0085, 0x180e, 0x200b]) {
      const char = String.fromCodePoint(point);
      const interior = `Á${char}na`;
      const expected = trimPoints.includes(point) ? interior : `${char}${interior}${char}`;
      add(
        version,
        [contract],
        `${type}-unicode-${String(point)}`,
        true,
        { ...login, username: `${char}${interior}${char}` },
        expected,
      );
    }
    for (const [name, username, valid] of [
      ['limit', ` ${'😀'.repeat(64)} `, true],
      ['over-limit', '😀'.repeat(65), false],
      ['empty-trim', ' \ufeff\u3000\t', false],
    ] as const)
      add(
        version,
        [contract],
        `${type}-${name}`,
        valid,
        { ...login, username },
        valid ? '😀'.repeat(64) : undefined,
      );
    for (const [name, password, valid] of [
      ['password-limit', '😀'.repeat(256), true],
      ['password-over-limit', '😀'.repeat(257), false],
      ['password-space', ' ', true],
      ['password-empty', '', false],
    ] as const)
      add(version, [contract], `${type}-${name}`, valid, { ...login, password });
    add(
      version,
      [contract],
      `${type}-ascii-limit`,
      true,
      { ...login, username: ` ${'a'.repeat(64)} ` },
      'a'.repeat(64),
    );
    add(version, [contract], `${type}-ascii-over-limit`, false, {
      ...login,
      username: 'a'.repeat(65),
    });
    add(version, [contract], `${type}-extra-property`, version === 'v1', { ...login, credential });
  }
  return fixtures;
}
