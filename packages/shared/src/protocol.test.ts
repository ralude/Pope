import { describe, expect, it } from 'vitest';

import {
  nodeToPcMessageSchema,
  pcProtocolJsonSchemas,
  pcToNodeMessageSchema,
  PROTOCOL_VERSION,
} from './protocol.js';

const PC_ID = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const SESSION_ID = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';
const COMBO_ID = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5d';

const valid = (message: unknown) => pcToNodeMessageSchema.safeParse(message).success;
const validOut = (message: unknown) => nodeToPcMessageSchema.safeParse(message).success;

describe('PC → nodo', () => {
  it('hello con y sin sesión', () => {
    const hello = { type: 'hello', protocolVersion: PROTOCOL_VERSION, pcId: PC_ID };
    expect(valid({ ...hello, sessionId: null })).toBe(true);
    expect(valid({ ...hello, sessionId: SESSION_ID })).toBe(true);
    expect(valid({ ...hello, sessionId: null, protocolVersion: 99 })).toBe(false);
    expect(valid({ ...hello, sessionId: null, pcId: 'PC 05' })).toBe(false);
    // Los ids son UUIDv7: un UUIDv4 no vale.
    expect(valid({ ...hello, sessionId: null, pcId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })).toBe(
      false,
    );
  });

  it('heartbeat con el restante local (REQ-001-63)', () => {
    expect(valid({ type: 'heartbeat', sessionId: SESSION_ID, localRemainingSeconds: 2400 })).toBe(
      true,
    );
    expect(valid({ type: 'heartbeat', sessionId: null, localRemainingSeconds: null })).toBe(true);
    expect(valid({ type: 'heartbeat', sessionId: SESSION_ID, localRemainingSeconds: -1 })).toBe(
      false,
    );
    expect(valid({ type: 'heartbeat', sessionId: SESSION_ID, localRemainingSeconds: 1.5 })).toBe(
      false,
    );
    expect(valid({ type: 'heartbeat' })).toBe(false);
  });

  it('login con usuario y contraseña (REQ-001-20)', () => {
    expect(valid({ type: 'login', username: 'juan', password: 'secreto' })).toBe(true);
    expect(valid({ type: 'login', username: '   ', password: 'secreto' })).toBe(false);
    expect(valid({ type: 'login', username: 'juan', password: '' })).toBe(false);
    expect(valid({ type: 'login', username: 'juan', password: 'x'.repeat(257) })).toBe(false);
    expect(valid({ type: 'login', username: 'juan' })).toBe(false);
  });

  it('el usuario se recorta', () => {
    const parsed = pcToNodeMessageSchema.parse({
      type: 'login',
      username: ' juan ',
      password: 'a',
    });
    expect(parsed).toEqual({ type: 'login', username: 'juan', password: 'a' });
  });

  it('logout y buyCombo (REQ-001-26, REQ-001-85)', () => {
    expect(valid({ type: 'logout' })).toBe(true);
    expect(valid({ type: 'buyCombo', comboId: COMBO_ID })).toBe(true);
    expect(valid({ type: 'buyCombo', comboId: 'combo-20h' })).toBe(false);
  });

  it('rechaza tipos desconocidos y mensajes que no son objetos', () => {
    expect(valid({ type: 'shutdown' })).toBe(false);
    expect(valid('hello')).toBe(false);
    expect(valid(null)).toBe(false);
  });
});

describe('nodo → PC', () => {
  const accountSession = {
    kind: 'account',
    sessionId: SESSION_ID,
    startedAt: '2026-09-24T22:00:00Z',
    username: 'juan',
    ratePerHour: { micros: 2_000_000, currency: 'USD' },
    comboSeconds: 1800,
    money: { micros: 3_000_000, currency: 'USD' },
    moneySeconds: 5400,
    remainingSeconds: 7200,
  };

  it('state bloqueada', () => {
    expect(validOut({ type: 'state', status: 'locked' })).toBe(true);
  });

  it('CA-001-16: state con cuenta muestra combo, saldo y total', () => {
    expect(
      validOut({ type: 'state', status: 'active', session: accountSession, vesRate: null }),
    ).toBe(true);
    expect(
      validOut({ type: 'state', status: 'active', session: accountSession, vesRate: 40_000_000 }),
    ).toBe(true);
  });

  it('state con sesión temporal (REQ-001-61)', () => {
    const session = {
      kind: 'temporary',
      sessionId: SESSION_ID,
      startedAt: '2026-09-24T22:30:00Z',
      name: 'Carlos',
      purchasedSeconds: 3600,
      remainingSeconds: 3600,
    };
    expect(validOut({ type: 'state', status: 'active', session, vesRate: null })).toBe(true);
  });

  it('state rechaza importes decimales, monedas desconocidas y fechas sin UTC', () => {
    const withSession = (session: object) => ({
      type: 'state',
      status: 'active',
      session: { ...accountSession, ...session },
      vesRate: null,
    });
    expect(validOut(withSession({ money: { micros: 3.5, currency: 'USD' } }))).toBe(false);
    expect(validOut(withSession({ money: { micros: 3_000_000, currency: 'EUR' } }))).toBe(false);
    expect(validOut(withSession({ startedAt: '2026-09-24T18:00:00-04:00' }))).toBe(false);
    expect(validOut(withSession({ remainingSeconds: -1 }))).toBe(false);
    expect(validOut({ type: 'state', status: 'active', vesRate: null })).toBe(false);
  });

  it('warning de 5 y 1 min (REQ-001-24)', () => {
    expect(validOut({ type: 'warning', sessionId: SESSION_ID, minutesLeft: 5 })).toBe(true);
    expect(validOut({ type: 'warning', sessionId: SESSION_ID, minutesLeft: 1 })).toBe(true);
    expect(validOut({ type: 'warning', sessionId: SESSION_ID, minutesLeft: 3 })).toBe(false);
  });

  it('sessionEnded con cada motivo de cierre (REQ-001-31)', () => {
    for (const reason of ['customer', 'staff', 'exhausted', 'no_heartbeat']) {
      expect(validOut({ type: 'sessionEnded', sessionId: SESSION_ID, reason })).toBe(true);
    }
    expect(validOut({ type: 'sessionEnded', sessionId: SESSION_ID, reason: 'crash' })).toBe(false);
  });

  it('error con código y mensaje en español (CA-001-02)', () => {
    const error = {
      type: 'error',
      code: 'session_already_active',
      message: 'Ya tienes una sesión abierta en la PC 03',
    };
    expect(validOut(error)).toBe(true);
    expect(validOut({ ...error, code: 'unknown' })).toBe(false);
    expect(validOut({ ...error, message: '' })).toBe(false);
  });
});

describe('JSON Schema para el agente en C# (ADR-0002)', () => {
  it('exporta los dos sentidos del canal con todos los tipos de mensaje', () => {
    const schemas = JSON.stringify(pcProtocolJsonSchemas());
    for (const type of ['hello', 'heartbeat', 'login', 'logout', 'buyCombo']) {
      expect(schemas).toContain(`"const":"${type}"`);
    }
    for (const type of ['state', 'warning', 'sessionEnded', 'error']) {
      expect(schemas).toContain(`"const":"${type}"`);
    }
  });

  it('conserva las restricciones de enteros y no negativos', () => {
    const { 'node-to-pc': nodeToPc } = pcProtocolJsonSchemas();
    const text = JSON.stringify(nodeToPc);
    expect(text).toContain('"type":"integer"');
    expect(text).toContain('"minimum":0');
  });
});
