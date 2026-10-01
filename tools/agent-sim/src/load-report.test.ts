import { describe, expect, it } from 'vitest';

import {
  type LoadResult,
  parseRssMb,
  percentile,
  renderReport,
  summarize,
  summarizeMemory,
  verdict,
} from './load-report.js';

describe('percentil por rango más cercano', () => {
  it('toma la posición ceil(p × n) de la lista ordenada', () => {
    const values = Array.from({ length: 40 }, (_, i) => (i + 1) * 10); // 10, 20, … 400
    expect(percentile(values, 0.95)).toBe(380); // posición 38
    expect(percentile(values, 0.5)).toBe(200); // posición 20
    expect(percentile([5, 1, 3], 0.95)).toBe(5);
    expect(percentile([7], 0.5)).toBe(7);
    expect(percentile([], 0.95)).toBeNaN();
  });

  it('no depende del orden de entrada', () => {
    expect(percentile([30, 10, 20, 40], 0.5)).toBe(20);
  });

  it('resume cantidad, p50, p95 y máximo', () => {
    expect(summarize([100, 200, 300, 400, 500])).toEqual({
      count: 5,
      p50: 300,
      p95: 500,
      max: 500,
    });
    expect(summarize([]).count).toBe(0);
  });
});

describe('memoria del servidor', () => {
  const line = (mb: string) => `[Nest] 1 - LOG [Memoria] Memoria: rss=${mb} MB heapUsed=20.0 MB`;

  it('lee los rss de un fragmento de log ignorando el resto de líneas', () => {
    const text = ['arranque', line('260.4'), 'otra cosa', line('83.6'), line('90.0')].join('\n');
    expect(parseRssMb(text)).toEqual([260.4, 83.6, 90]);
    expect(parseRssMb('nada de memoria')).toEqual([]);
  });

  it('separa el pico desde el arranque, el de la prueba y el del final de las sesiones', () => {
    const start = [line('260.4'), line('84.0')].join('\n');
    const hold = [line('90.0'), line('120.5'), line('118.0')].join('\n');
    const end = [line('119.0')].join('\n');
    expect(
      summarizeMemory({
        wholeLog: `${start}\n${hold}\n${end}`,
        duringTest: `${hold}\n${end}`,
        duringHold: hold,
      }),
    ).toEqual({ peakSinceStartMb: 260.4, peakDuringTestMb: 120.5, endOfHoldMb: 118 });
    expect(summarizeMemory({ wholeLog: '', duringTest: '', duringHold: '' })).toEqual({
      peakSinceStartMb: null,
      peakDuringTestMb: null,
      endOfHoldMb: null,
    });
  });
});

describe('veredicto e informe', () => {
  const base: LoadResult = {
    pcs: 40,
    staggerMs: 1500,
    holdSeconds: 600,
    staggered: { count: 40, p50: 80, p95: 190, max: 240 },
    burst: { count: 40, p50: 2100, p95: 3900, max: 4100 },
    errors: [],
    memory: { peakSinceStartMb: 260.4, peakDuringTestMb: 140.2, endOfHoldMb: 132 },
  };

  it('pasa con p95 < 2 s y rss < 384 MB; la ráfaga no decide', () => {
    expect(verdict(base)).toEqual({ latency: true, memory: true, ok: true });
  });

  it('falla si el p95 de la fase 1 llega a 2 s, si la memoria pasa de 384 MB o hay errores', () => {
    expect(verdict({ ...base, staggered: { ...base.staggered, p95: 2000 } }).ok).toBe(false);
    const heavy = { peakSinceStartMb: 384, peakDuringTestMb: 384, endOfHoldMb: 384 };
    expect(verdict({ ...base, memory: heavy }).memory).toBe(false);
    expect(verdict({ ...base, errors: ['fase 1 · PC 03: sin saldo'] }).ok).toBe(false);
  });

  it('sin log del servidor la memoria queda sin medir y no bloquea el veredicto', () => {
    expect(verdict({ ...base, memory: null })).toEqual({ latency: true, memory: null, ok: true });
  });

  it('el informe es una tabla Markdown con los números y el veredicto', () => {
    const report = renderReport(base);
    expect(report).toContain(
      '| 1. 40 PCs conectadas, un login cada 1.5 s (decide) | 40 | 80 ms | 190 ms | 240 ms | 0 |',
    );
    expect(report).toContain(
      '| 2. ráfaga de 40 logins a la vez (informativa) | 40 | 2100 ms | 3900 ms | 4100 ms | 0 |',
    );
    expect(report).toContain(
      'pico desde el arranque 260.4 MB · pico durante la prueba 140.2 MB · al final de las sesiones 132.0 MB',
    );
    expect(report).toContain('- ✓ p95 del login (fase 1) < 2000 ms');
    expect(report).toContain('- ✓ rss máximo < 384 MB');
    expect(renderReport({ ...base, memory: null })).toContain('no medida');
  });
});
