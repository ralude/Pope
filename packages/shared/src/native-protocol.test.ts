import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  nativeNodeToPcMessageSchema,
  nativePcToNodeMessageSchema,
  nativeShellNotificationSchema,
  nativeShellRequestSchema,
} from './native-protocol.js';
import { pcToNodeMessageSchema } from './protocol.js';

const ID = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const TIME = '2026-10-04T20:00:00Z';
const context = { kind: 'free', revision: ID };
const hello = {
  type: 'hello',
  protocolVersion: 2,
  pcId: ID,
  sessionId: null,
  recoveryState: 'unknown',
  controlContext: null,
  pendingMaintenanceExitId: null,
};
const command = {
  type: 'command',
  command: {
    id: ID,
    pcId: ID,
    actor: { kind: 'staff', staffId: ID, name: 'Ana' },
    expected: context,
    issuedAt: TIME,
    expiresAt: '2026-10-04T20:00:30Z',
    action: { kind: 'lock' },
  },
};

describe('canal nativo v2', () => {
  it('REQ-003-63: prepara hello sin credencial, sin admitir v1 en el esquema v2', () => {
    expect(nativePcToNodeMessageSchema.parse(hello)).toEqual(hello);
    expect(
      nativePcToNodeMessageSchema.safeParse({ ...hello, credential: 'A'.repeat(43) }).success,
    ).toBe(false);
    expect(nativePcToNodeMessageSchema.safeParse({ ...hello, protocolVersion: 1 }).success).toBe(
      false,
    );
    expect(
      pcToNodeMessageSchema.safeParse({
        type: 'hello',
        protocolVersion: 1,
        pcId: ID,
        sessionId: null,
      }).success,
    ).toBe(true);
  });

  it('REQ-003-04: diferencia recuperación desconocida de una copia persistida', () => {
    expect(nativePcToNodeMessageSchema.safeParse({ ...hello, sessionId: ID }).success).toBe(false);
    const known = { ...hello, recoveryState: 'known', controlContext: context };
    expect(nativePcToNodeMessageSchema.parse(known)).toEqual(known);
    expect(nativePcToNodeMessageSchema.safeParse({ ...known, controlContext: null }).success).toBe(
      false,
    );
    expect(
      nativePcToNodeMessageSchema.safeParse({
        type: 'heartbeat',
        sessionId: null,
        localRemainingSeconds: null,
        controlContext: context,
      }).success,
    ).toBe(true);
  });

  it('REQ-003-63: React no fabrica identidad, latidos, acuses ni órdenes', () => {
    for (const forbidden of [
      hello,
      command,
      {
        type: 'commandAck',
        commandId: ID,
        occurredAt: TIME,
        result: { status: 'accepted', kind: 'restart' },
      },
      { type: 'heartbeat', sessionId: null, localRemainingSeconds: null, controlContext: null },
    ]) {
      expect(nativeShellRequestSchema.safeParse(forbidden).success).toBe(false);
    }
    expect(nativeShellNotificationSchema.safeParse(command).success).toBe(false);
    expect(nativeNodeToPcMessageSchema.parse(command)).toEqual(command);
  });

  it('REQ-003-40, REQ-003-44: login y salida local, salida durable solo hacia nodo', () => {
    const login = { type: 'technicalLogin', requestId: ID, username: 'ana', password: 'prueba' };
    const end = { type: 'endMaintenance', requestId: ID, maintenanceId: ID };
    const exit = {
      type: 'maintenanceExit',
      exit: { id: ID, maintenanceId: ID, endedAt: TIME, durationSeconds: 12 },
    };
    expect(nativeShellRequestSchema.parse(login)).toEqual(login);
    expect(nativePcToNodeMessageSchema.parse(login)).toEqual(login);
    expect(nativeShellRequestSchema.parse(end)).toEqual(end);
    expect(nativePcToNodeMessageSchema.safeParse(end).success).toBe(false);
    expect(nativePcToNodeMessageSchema.parse(exit)).toEqual(exit);
    expect(nativeShellRequestSchema.safeParse(exit).success).toBe(false);
  });

  it('REQ-003-21: sesión, contexto, mantenimiento y autenticación son mensajes distintos', () => {
    for (const message of [
      { type: 'state', status: 'locked' },
      { type: 'controlState', context, serverTime: TIME },
      { type: 'maintenanceState', maintenance: null },
      { type: 'pcAuthenticationError', code: 'pc_credential_revoked', message: 'PC revocada' },
      { type: 'maintenanceExitAcknowledged', exitId: ID, maintenanceId: ID },
    ]) {
      expect(nativeNodeToPcMessageSchema.parse(message)).toEqual(message);
    }
    expect(
      nativeNodeToPcMessageSchema.safeParse({ type: 'state', status: 'maintenance' }).success,
    ).toBe(false);
  });

  it('REQ-002-04, REQ-003-63: conserva saldo y pausa del nodo, rechaza secretos anidados', () => {
    const state = {
      type: 'state',
      status: 'active',
      vesRate: null,
      session: {
        kind: 'account',
        sessionId: ID,
        startedAt: TIME,
        username: 'juan',
        ratePerHour: { micros: 1_000_000, currency: 'USD' },
        comboSeconds: 60,
        money: { micros: 0, currency: 'USD' },
        moneySeconds: 0,
        remainingSeconds: 60,
        pause: { startedAt: TIME, maxUntil: TIME, billing: false, secondsLeft: 0 },
      },
    };
    expect(nativeNodeToPcMessageSchema.parse(state)).toEqual(state);
    expect(
      nativeNodeToPcMessageSchema.safeParse({
        ...state,
        session: {
          ...state.session,
          money: { ...state.session.money, credential: 'A'.repeat(43) },
        },
      }).success,
    ).toBe(false);
    expect(
      nativeNodeToPcMessageSchema.safeParse({ type: 'execute', path: 'cmd.exe' }).success,
    ).toBe(false);
    for (const schema of [
      nativePcToNodeMessageSchema,
      nativeNodeToPcMessageSchema,
      nativeShellRequestSchema,
      nativeShellNotificationSchema,
    ]) {
      expect(z.toJSONSchema(schema).anyOf).toBeDefined();
    }
  });
});
