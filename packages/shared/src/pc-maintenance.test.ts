import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { domainEventSchema } from './events.js';
import {
  maintenanceExitAcknowledgedMessageSchema,
  maintenanceExitMessageSchema,
  maintenanceStateMessageSchema,
  pcMaintenanceSchema,
  TECHNICAL_LOGIN_LOCK_SECONDS,
  TECHNICAL_LOGIN_MAX_FAILURES,
  technicalErrorMessageSchema,
  technicalLoginMessageSchema,
} from './pc-maintenance.js';

const ID = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const TIME = '2026-10-04T20:00:00Z';
const actor = { kind: 'staff', staffId: ID, name: 'Ana' };
const pc = { id: ID, name: 'PC 01' };
const maintenance = { id: ID, pc, actor, source: 'local', startedAt: TIME };
const exit = { id: ID, maintenanceId: ID, endedAt: TIME, durationSeconds: 0 };

describe('contratos de mantenimiento', () => {
  it('REQ-003-40: login solo con credenciales Pope, sin actor ni elevación impuestos', () => {
    const login = { type: 'technicalLogin', requestId: ID, username: 'ana', password: 'prueba' };
    expect(technicalLoginMessageSchema.parse(login)).toEqual(login);
    for (const extra of [{ actor }, { role: 'administrador' }, { windowsPassword: 'prueba' }]) {
      expect(technicalLoginMessageSchema.safeParse({ ...login, ...extra }).success).toBe(false);
    }
    expect(technicalLoginMessageSchema.safeParse({ ...login, password: '' }).success).toBe(false);
  });

  it('REQ-003-43: mantenimiento confirmado separado de sesión y de orden solicitada', () => {
    expect(pcMaintenanceSchema.parse(maintenance)).toEqual(maintenance);
    expect(
      maintenanceStateMessageSchema.parse({ type: 'maintenanceState', maintenance: null }),
    ).toEqual({ type: 'maintenanceState', maintenance: null });
    for (const extra of [{ sessionId: ID }, { password: 'prueba' }, { command: 'cmd.exe' }]) {
      expect(pcMaintenanceSchema.safeParse({ ...maintenance, ...extra }).success).toBe(false);
    }
    expect(
      pcMaintenanceSchema.safeParse({ ...maintenance, actor: { kind: 'system' } }).success,
    ).toBe(false);
  });

  it('REQ-003-44: salida retransmitible con ID estable y sin actor impuesto', () => {
    const message = { type: 'maintenanceExit', exit };
    expect(maintenanceExitMessageSchema.parse(message)).toEqual(message);
    expect(maintenanceExitMessageSchema.parse(message)).toEqual(message);
    expect(
      maintenanceExitAcknowledgedMessageSchema.parse({
        type: 'maintenanceExitAcknowledged',
        exitId: ID,
        maintenanceId: ID,
      }),
    ).toEqual({ type: 'maintenanceExitAcknowledged', exitId: ID, maintenanceId: ID });
    for (const extra of [{ actor }, { durationSeconds: -1 }, { durationSeconds: 0.5 }]) {
      expect(
        maintenanceExitMessageSchema.safeParse({ ...message, exit: { ...exit, ...extra } }).success,
      ).toBe(false);
    }
  });

  it('REQ-003-45: error correlacionado y constantes independientes del login del panel', () => {
    expect(TECHNICAL_LOGIN_MAX_FAILURES).toBe(10);
    expect(TECHNICAL_LOGIN_LOCK_SECONDS).toBe(60);
    const error = {
      type: 'technicalError',
      requestId: ID,
      code: 'technical_login_locked',
      message: 'Espera un minuto',
      lockedUntil: TIME,
    };
    expect(technicalErrorMessageSchema.parse(error)).toEqual(error);
    expect(technicalErrorMessageSchema.safeParse({ ...error, password: 'prueba' }).success).toBe(
      false,
    );
  });

  it('REQ-003-41: auditoría conserva actor del personal, tiempos UTC y duración entera', () => {
    const base = { id: ID, version: 1, actor, occurredAt: TIME };
    const started = {
      ...base,
      type: 'pc.maintenance_started',
      payload: { maintenanceId: ID, pc, source: 'panel', startedAt: TIME },
    };
    const ended = {
      ...base,
      type: 'pc.maintenance_ended',
      payload: {
        maintenanceId: ID,
        exitId: ID,
        pc,
        source: 'local',
        startedAt: TIME,
        endedAt: TIME,
        durationSeconds: 0,
      },
    };
    for (const event of [started, ended]) {
      expect(domainEventSchema.parse(event)).toEqual(event);
      expect(domainEventSchema.safeParse({ ...event, actor: { kind: 'system' } }).success).toBe(
        false,
      );
      expect(
        domainEventSchema.safeParse({ ...event, payload: { ...event.payload, password: 'prueba' } })
          .success,
      ).toBe(false);
    }
    expect(
      domainEventSchema.parse({
        ...base,
        actor: { kind: 'system' },
        type: 'staff.technical_login_locked',
        payload: { staffId: ID, username: 'ana', pc, lockedUntil: TIME },
      }).type,
    ).toBe('staff.technical_login_locked');
  });

  it('REQ-003-63: todos los contratos se exportan sin transformaciones ocultas', () => {
    for (const schema of [
      technicalLoginMessageSchema,
      pcMaintenanceSchema,
      maintenanceExitMessageSchema,
      maintenanceExitAcknowledgedMessageSchema,
    ]) {
      expect(z.toJSONSchema(schema).additionalProperties).toBe(false);
    }
  });
});
