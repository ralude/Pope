import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  isPcCommandCurrent,
  pcCommandAckMessageSchema,
  pcCommandRequestSchema,
  pcCommandSchema,
  pcCommandErrorSchema,
  pcNativeActionSchema,
  STAFF_MESSAGE_DURATION_SECONDS,
  STAFF_MESSAGE_MAX_CHARACTERS,
} from './pc-control.js';

const ID = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const OTHER = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';
const TIME = '2026-10-04T20:00:00Z';
const free = { kind: 'free', revision: ID } as const;
const session = { kind: 'session', revision: ID, sessionId: ID } as const;
const maintenance = { kind: 'maintenance', revision: ID, maintenanceId: ID } as const;
const command = pcCommandSchema.parse({
  id: ID,
  pcId: ID,
  actor: {
    kind: 'staff',
    staffId: ID,
    name: 'Ana',
  },
  expected: free,
  issuedAt: TIME,
  expiresAt: '2026-10-04T20:00:30Z',
  action: { kind: 'lock' },
});

describe('órdenes de PC', () => {
  it('REQ-003-20: reinicio/apagado con cliente o mantenimiento exige confirmación', () => {
    for (const kind of ['restart', 'powerOff']) {
      expect(pcCommandRequestSchema.safeParse({ id: ID, kind, expected: free }).success).toBe(true);
      for (const expected of [session, maintenance]) {
        expect(pcCommandRequestSchema.safeParse({ id: ID, kind, expected }).success).toBe(false);
        expect(
          pcCommandRequestSchema.safeParse({ id: ID, kind, expected, confirmed: false }).success,
        ).toBe(false);
        expect(
          pcCommandRequestSchema.safeParse({ id: ID, kind, expected, confirmed: true }).success,
        ).toBe(true);
      }
    }
  });

  it('REQ-003-43: no inicia mantenimiento ocupado ni admite mensajes durante él', () => {
    expect(
      pcCommandRequestSchema.safeParse({ id: ID, kind: 'startMaintenance', expected: free })
        .success,
    ).toBe(true);
    for (const expected of [session, maintenance]) {
      expect(
        pcCommandRequestSchema.safeParse({ id: ID, kind: 'startMaintenance', expected }).success,
      ).toBe(false);
    }
    expect(
      pcCommandRequestSchema.safeParse({
        id: ID,
        kind: 'showMessage',
        expected: maintenance,
        text: 'Hola',
      }).success,
    ).toBe(false);
  });

  it('REQ-003-20: rechaza comandos/rutas libres y actor impuesto desde el panel', () => {
    expect(pcNativeActionSchema.safeParse({ kind: 'execute', path: 'cmd.exe' }).success).toBe(
      false,
    );
    expect(pcNativeActionSchema.safeParse({ kind: 'restart', args: '/f' }).success).toBe(false);
    expect(
      pcCommandRequestSchema.safeParse({
        id: ID,
        kind: 'lock',
        expected: free,
        actor: command.actor,
      }).success,
    ).toBe(false);
    for (const action of [
      { kind: 'lock' },
      { kind: 'restart' },
      { kind: 'powerOff' },
      { kind: 'showMessage', text: 'Hola' },
      { kind: 'startMaintenance', maintenanceId: ID, source: 'panel' },
      { kind: 'endMaintenance', maintenanceId: ID, exitId: OTHER },
    ]) {
      expect(pcCommandSchema.safeParse({ ...command, action }).success).toBe(true);
    }
  });

  it('REQ-003-20: mensaje acotado, presentación fija sin parámetros de foco', () => {
    expect(STAFF_MESSAGE_DURATION_SECONDS).toBe(5);
    expect(STAFF_MESSAGE_MAX_CHARACTERS).toBe(1_000);
    for (const text of ['', 'a'.repeat(1_001)]) {
      expect(pcNativeActionSchema.safeParse({ kind: 'showMessage', text }).success).toBe(false);
    }
    expect(
      pcNativeActionSchema.safeParse({ kind: 'showMessage', text: 'Hola', modal: true }).success,
    ).toBe(false);
  });

  it('REQ-003-20: caduca exactamente a los 30 s y descarta otra revisión/sesión', () => {
    const now = Date.parse(TIME);
    expect(isPcCommandCurrent(command, free, now + 29_999)).toBe(true);
    for (const instant of [now - 1, now + 30_000, NaN]) {
      expect(isPcCommandCurrent(command, free, instant)).toBe(false);
    }
    expect(isPcCommandCurrent(command, { ...free, revision: OTHER }, now)).toBe(false);
    expect(isPcCommandCurrent({ ...command, expected: session }, session, now)).toBe(true);
    expect(
      isPcCommandCurrent({ ...command, expected: session }, { ...session, sessionId: OTHER }, now),
    ).toBe(false);
    expect(isPcCommandCurrent({ ...command, expected: maintenance }, maintenance, now)).toBe(true);
    expect(isPcCommandCurrent(command, session, now)).toBe(false);
  });

  it('REQ-003-21: no confunde reinicio aceptado con apagado físico completado', () => {
    const ack = { type: 'commandAck', commandId: ID, occurredAt: TIME };
    expect(
      pcCommandAckMessageSchema.safeParse({
        ...ack,
        result: { status: 'accepted', kind: 'restart' },
      }).success,
    ).toBe(true);
    expect(
      pcCommandAckMessageSchema.safeParse({
        ...ack,
        result: { status: 'applied', effect: { kind: 'restart' } },
      }).success,
    ).toBe(false);
    expect(
      pcCommandAckMessageSchema.safeParse({
        ...ack,
        result: { status: 'applied', effect: { kind: 'lock' } },
      }).success,
    ).toBe(true);
    expect(
      pcCommandAckMessageSchema.safeParse({
        ...ack,
        result: {
          status: 'failed',
          kind: 'powerOff',
          code: 'native_failure',
          message: 'Falló Windows',
        },
      }).success,
    ).toBe(true);
    expect(z.toJSONSchema(pcCommandAckMessageSchema).additionalProperties).toBe(false);
    expect(
      pcCommandErrorSchema.parse({
        code: 'idempotency_conflict',
        message: 'Ese ID identifica otra orden',
      }).code,
    ).toBe('idempotency_conflict');
  });
});
