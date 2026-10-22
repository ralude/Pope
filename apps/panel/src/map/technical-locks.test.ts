import { describe, expect, it } from 'vitest';

import { parsePanelMessage } from './channel.js';
import { addLock, lockKey, lockText, pruneLocks, visibleLocks } from './technical-locks.js';

const LOCK = {
  type: 'technicalLoginLocked' as const,
  staffName: 'Luis',
  username: 'luis',
  pc: { id: '01900000-0000-7000-8000-000000000004', name: 'PC 04' },
  lockedUntil: '2026-10-22T20:05:00.000Z',
};
const NOW = new Date('2026-10-22T20:04:30Z');

describe('avisos de bloqueo del login técnico (REQ-003-45)', () => {
  it('el canal acepta el mensaje del nodo', () => {
    expect(parsePanelMessage(JSON.stringify(LOCK))).toEqual(LOCK);
    expect(parsePanelMessage(JSON.stringify({ ...LOCK, pc: 'PC 04' }))).toBeNull();
  });

  it('el mismo bloqueo recibido dos veces es un solo aviso; otro bloqueo, otro aviso', () => {
    const once = addLock([], LOCK);
    expect(addLock(once, LOCK)).toHaveLength(1);
    const next = { ...LOCK, lockedUntil: '2026-10-22T20:09:00.000Z' };
    expect(addLock(once, next)).toHaveLength(2);
    expect(lockKey(LOCK)).not.toBe(lockKey(next));
  });

  it('se ve hasta cumplirse el minuto o hasta que el encargado lo cierra', () => {
    expect(visibleLocks([LOCK], new Set(), NOW)).toEqual([LOCK]);
    expect(visibleLocks([LOCK], new Set([lockKey(LOCK)]), NOW)).toEqual([]);
    expect(visibleLocks([LOCK], new Set(), new Date('2026-10-22T20:05:00Z'))).toEqual([]);
    expect(pruneLocks([LOCK], new Date('2026-10-22T20:06:00Z'))).toEqual([]);
    expect(pruneLocks([LOCK], NOW)).toEqual([LOCK]);
  });

  it('dice quién, en qué PC y a qué hora (de Caracas) puede volver a intentarlo', () => {
    expect(lockText(LOCK)).toBe(
      'Login técnico bloqueado: Luis falló 10 veces en la PC 04. Podrá volver a intentarlo a las 16:05.',
    );
  });
});
