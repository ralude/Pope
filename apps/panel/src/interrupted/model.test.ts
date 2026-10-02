import { type PcMapItem, type TemporarySession, temporarySessionSchema } from '@pope/shared';
import { describe, expect, it } from 'vitest';

import {
  backupPcs,
  formatLocalMoment,
  reasonText,
  remainingText,
  restoreTargets,
} from './model.js';

// Miércoles 30 de septiembre, 18:32 en Caracas.
const NOW = new Date('2026-09-30T22:32:00.000Z');

const PC5 = { id: '01900000-0000-7000-8000-000000000005', name: 'PC 05' };
const PC2 = { id: '01900000-0000-7000-8000-000000000002', name: 'PC 02' };

function session(over: Record<string, unknown> = {}): TemporarySession {
  return temporarySessionSchema.parse({
    id: '01900000-0000-7000-8000-0000000000c1',
    pc: PC5,
    name: 'Carlos',
    status: 'ended',
    purchasedSeconds: 3600,
    remainingSeconds: 2400,
    amountMicros: 1_500_000,
    rateMicrosPerHour: 1_500_000,
    openedBy: 'Ana',
    startedAt: '2026-09-30T21:40:00.000Z',
    endedAt: '2026-09-30T22:23:00.000Z',
    endReason: 'no_heartbeat',
    restoredFrom: null,
    interruption: {
      status: 'pending',
      interruptedAt: '2026-09-30T22:20:00.000Z',
      expiresAt: '2026-10-02T22:20:00.000Z',
      restoredBy: null,
    },
    ...over,
  });
}

describe('horas y tiempos', () => {
  it('pone el día delante si el instante no es de hoy en el local', () => {
    expect(formatLocalMoment(new Date('2026-09-30T22:20:00Z'), NOW)).toBe('18:20');
    expect(formatLocalMoment(new Date('2026-09-29T01:10:00Z'), NOW)).toBe('lun 21:10');
    expect(formatLocalMoment(new Date('2026-10-02T22:20:00Z'), NOW)).toBe('vie 18:20');
  });

  it('dice lo que le quedaba', () => {
    expect(remainingText(2400)).toBe('40 min');
    expect(remainingText(3900)).toBe('1 h 05 min');
    expect(remainingText(20)).toBe('menos de 1 min');
  });
});

describe('motivo en el respaldo (REQ-001-64)', () => {
  it('distingue pendiente, restaurada y caducada', () => {
    expect(reasonText(session(), NOW)).toBe('Sin latidos · pendiente');
    const restored = session({
      interruption: {
        status: 'restored',
        interruptedAt: '2026-09-30T22:20:00.000Z',
        expiresAt: '2026-10-02T22:20:00.000Z',
        restoredBy: {
          name: 'Ana',
          at: '2026-09-30T22:31:00.000Z',
          sessionId: '01900000-0000-7000-8000-0000000000c2',
        },
      },
    });
    expect(reasonText(restored, NOW)).toBe('Restaurada por Ana a las 18:31');
    const expired = session({
      interruption: {
        status: 'expired',
        interruptedAt: '2026-09-28T22:00:00.000Z',
        expiresAt: '2026-09-30T22:00:00.000Z',
        restoredBy: null,
      },
    });
    expect(reasonText(expired, NOW)).toBe('Sin latidos · caducada');
  });

  it('dice por qué terminaron las demás', () => {
    const ended = (endReason: string) =>
      reasonText(session({ endReason, interruption: null, remainingSeconds: 0 }), NOW);
    expect(ended('exhausted')).toBe('Se agotó el tiempo');
    expect(ended('staff')).toBe('La cerró el encargado');
    expect(ended('customer')).toBe('La cerró el cliente');
    expect(
      reasonText(
        session({ status: 'active', endedAt: null, endReason: null, interruption: null }),
        NOW,
      ),
    ).toBe('En curso');
  });
});

describe('PCs', () => {
  const pc = (ref: { id: string; name: string }, over: Partial<PcMapItem> = {}): PcMapItem => ({
    ...ref,
    row: null,
    col: null,
    connected: true,
    session: null,
    ...over,
  });

  it('solo se restaura en PCs conectadas, por nombre (REQ-001-67)', () => {
    const offline = pc(
      { id: '01900000-0000-7000-8000-000000000009', name: 'PC 09' },
      {
        connected: false,
      },
    );
    const targets = restoreTargets([pc(PC5), offline, pc(PC2)]);
    expect(targets.map((p) => p.name)).toEqual(['PC 02', 'PC 05']);
  });

  it('lista las PCs del respaldo sin repetir', () => {
    const list = backupPcs([session(), session({ pc: PC2 }), session()]);
    expect(list).toEqual([PC2, PC5]);
  });
});
