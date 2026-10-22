import { describe, expect, it } from 'vitest';

import { nativeStateMessageSchema } from './native-protocol.js';
import { stateMessageSchema } from './protocol.js';
import {
  pcContinueRequestSchema,
  pcContinueResponseSchema,
  pcRevocationErrorSchema,
  pcRevokeRequestSchema,
  pcRevokeResponseSchema,
} from './pc-revocation.js';

const ID = '01900000-0000-7000-8000-000000000001';
const PC = { id: '01900000-0000-7000-8000-000000000004', name: 'PC 04' };

describe('revocación conservando la sesión (REQ-003-11, T34a)', () => {
  it('las peticiones llevan solo su ID y, al continuar, la sesión', () => {
    expect(pcRevokeRequestSchema.safeParse({ id: ID }).success).toBe(true);
    expect(pcRevokeRequestSchema.safeParse({ id: ID, actor: 'ana' }).success).toBe(false);
    expect(pcContinueRequestSchema.safeParse({ id: ID, sessionId: ID }).success).toBe(true);
    expect(pcContinueRequestSchema.safeParse({ id: ID }).success).toBe(false);
  });

  it('la respuesta de revocar dice qué sesión queda retenida, o ninguna', () => {
    const base = { pc: PC, revokedAt: '2026-10-22T20:00:00.000Z' };
    expect(pcRevokeResponseSchema.safeParse({ ...base, heldSessionId: ID }).success).toBe(true);
    expect(pcRevokeResponseSchema.safeParse({ ...base, heldSessionId: null }).success).toBe(true);
    expect(pcRevokeResponseSchema.safeParse(base).success).toBe(false);
    expect(pcContinueResponseSchema.safeParse({ sessionId: ID, heldSeconds: 1200 }).success).toBe(
      true,
    );
    expect(pcContinueResponseSchema.safeParse({ sessionId: ID, heldSeconds: -1 }).success).toBe(
      false,
    );
  });

  it('los errores son un código cerrado con su mensaje', () => {
    for (const code of ['pc_not_registered', 'pc_not_held', 'pc_not_relinked'] as const) {
      expect(pcRevocationErrorSchema.safeParse({ code, message: 'x' }).success).toBe(true);
    }
    expect(pcRevocationErrorSchema.safeParse({ code: 'otro', message: 'x' }).success).toBe(false);
  });

  it('el estado retenido lleva la sesión y el motivo, sin tiempo ni saldo', () => {
    const held = { type: 'state', status: 'held', sessionId: ID, reason: 'credential_revoked' };
    expect(stateMessageSchema.safeParse(held).success).toBe(true);
    expect(nativeStateMessageSchema.safeParse(held).success).toBe(true);
    expect(stateMessageSchema.safeParse({ ...held, reason: 'otro' }).success).toBe(false);
    expect(nativeStateMessageSchema.safeParse({ ...held, remainingSeconds: 10 }).success).toBe(
      false,
    );
  });
});
