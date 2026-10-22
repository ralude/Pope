import { describe, expect, it } from 'vitest';

import type { PcFeed } from '../channel/feed.js';
import { applyEvent, INITIAL_FEED } from '../channel/feed.js';
import { HELD_TEXT, isHeld } from './held.js';

const SESSION = '01900000-0000-7000-8000-000000000124';
const HELD = {
  type: 'state',
  status: 'held',
  sessionId: SESSION,
  reason: 'credential_revoked',
} as const;
const ACTIVE = {
  type: 'state',
  status: 'active',
  vesRate: null,
  session: {
    kind: 'temporary',
    sessionId: SESSION,
    startedAt: '2026-10-22T20:00:00.000Z',
    name: 'Carlos',
    purchasedSeconds: 3600,
    remainingSeconds: 3000,
  },
} as never;

const feedWith = (message: object): PcFeed =>
  applyEvent(INITIAL_FEED, { kind: 'message', message: message as never }, 0);

describe('sesión retenida en el Shell (REQ-003-11, T34h)', () => {
  it('el estado retenido del nodo manda la pantalla de «PC bloqueada», sin ser sesión ni bloqueo normal', () => {
    expect(isHeld(INITIAL_FEED)).toBe(false);
    const held = feedWith(HELD);
    expect(isHeld(held)).toBe(true);
    expect(held.state).toEqual(HELD);
    expect(held.ended).toBe(false);
    expect(held.warning).toBeNull();
  });

  it('al autorizar continuar vuelve la sesión; si la cierra el personal, el fin y el bloqueo', () => {
    const held = feedWith(HELD);
    expect(isHeld(applyEvent(held, { kind: 'message', message: ACTIVE }, 1))).toBe(false);
    const ended = applyEvent(
      held,
      { kind: 'message', message: { type: 'sessionEnded', sessionId: SESSION, reason: 'staff' } },
      1,
    );
    expect(isHeld(ended)).toBe(false);
    expect(ended.ended).toBe(true);
  });

  it('el texto tranquiliza al cliente: su sesión y su tiempo están a salvo', () => {
    expect(HELD_TEXT).toMatch(/sesión y tu tiempo están a salvo/);
  });
});
