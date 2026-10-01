// Cálculos e informe de la prueba de carga (T37, REQ-001-50, ADR-0011). Son funciones puras:
// la prueba en sí (`load.ts`) necesita el servidor y no entra en `pnpm test`.

/** Límite del p95 del login con 40 PCs conectadas (REQ-001-50): 2 s. */
export const LOGIN_P95_LIMIT_MS = 2000;
/** Techo de memoria de Node en el nodo local (ADR-0011): 384 MB. */
export const RSS_LIMIT_MB = 384;

/**
 * Percentil por rango más cercano: la posición `ceil(p × n)` de la lista ordenada (con
 * p entre 0 y 1). Sin datos devuelve `NaN`.
 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) {
    return Number.NaN;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(p * sorted.length));
  return sorted[rank - 1] ?? Number.NaN;
}

export interface LatencySummary {
  count: number;
  p50: number;
  p95: number;
  max: number;
}

export function summarize(latenciesMs: readonly number[]): LatencySummary {
  return {
    count: latenciesMs.length,
    p50: percentile(latenciesMs, 0.5),
    p95: percentile(latenciesMs, 0.95),
    max: latenciesMs.length === 0 ? Number.NaN : Math.max(...latenciesMs),
  };
}

/** Los `rss` (en MB) de las líneas `Memoria: rss=… MB` de un fragmento del log del servidor. */
export function parseRssMb(logText: string): number[] {
  return [...logText.matchAll(/Memoria: rss=(\d+(?:\.\d+)?) MB/g)].map((m) => Number(m[1]));
}

export interface MemorySummary {
  /** Pico desde que arrancó el servidor, incluido el arranque y las migraciones. */
  peakSinceStartMb: number | null;
  /** Pico mientras duró la prueba. */
  peakDuringTestMb: number | null;
  /** Último registro al terminar la fase de las 40 sesiones. */
  endOfHoldMb: number | null;
}

const max = (values: number[]): number | null => (values.length === 0 ? null : Math.max(...values));

/**
 * Resume la memoria a partir del log del servidor: `wholeLog` es todo el archivo,
 * `duringTest` lo escrito entre el principio y el final de la prueba y `duringHold` lo escrito
 * hasta terminar las 40 sesiones.
 */
export function summarizeMemory(input: {
  wholeLog: string;
  duringTest: string;
  duringHold: string;
}): MemorySummary {
  return {
    peakSinceStartMb: max(parseRssMb(input.wholeLog)),
    peakDuringTestMb: max(parseRssMb(input.duringTest)),
    endOfHoldMb: parseRssMb(input.duringHold).at(-1) ?? null,
  };
}

export interface LoadResult {
  pcs: number;
  staggerMs: number;
  holdSeconds: number;
  /** Fase 1, la que decide: 40 PCs conectadas y logins escalonados. */
  staggered: LatencySummary;
  /** Fase 2, informativa: todos los logins a la vez. */
  burst: LatencySummary;
  errors: string[];
  memory: MemorySummary | null;
}

const ms = (value: number) => (Number.isNaN(value) ? '—' : `${String(Math.round(value))} ms`);
const mb = (value: number | null) => (value === null ? 'no medida' : `${value.toFixed(1)} MB`);

/** ¿Pasa la prueba? p95 de la fase 1 < 2 s, `rss` < 384 MB y ningún error. */
export function verdict(result: LoadResult): {
  latency: boolean;
  memory: boolean | null;
  ok: boolean;
} {
  const latency = result.staggered.p95 < LOGIN_P95_LIMIT_MS;
  const peak = result.memory?.peakSinceStartMb ?? null;
  const memory = peak === null ? null : peak < RSS_LIMIT_MB;
  return { latency, memory, ok: latency && memory !== false && result.errors.length === 0 };
}

/** Informe en Markdown, listo para pegar en `mediciones.md`. */
export function renderReport(result: LoadResult): string {
  const v = verdict(result);
  const mark = (pass: boolean | null) => (pass === null ? '—' : pass ? '✓' : '✗');
  const row = (label: string, s: LatencySummary, errors: number) =>
    `| ${label} | ${String(s.count)} | ${ms(s.p50)} | ${ms(s.p95)} | ${ms(s.max)} | ${String(errors)} |`;
  const lines = [
    '| Fase | Logins | p50 | p95 | máx | errores |',
    '|---|---|---|---|---|---|',
    row(
      `1. ${String(result.pcs)} PCs conectadas, un login cada ${String(result.staggerMs / 1000)} s (decide)`,
      result.staggered,
      result.errors.filter((e) => e.startsWith('fase 1')).length,
    ),
    row(
      `2. ráfaga de ${String(result.pcs)} logins a la vez (informativa)`,
      result.burst,
      result.errors.filter((e) => e.startsWith('fase 2')).length,
    ),
    '',
    `Sesiones mantenidas ${String(result.holdSeconds)} s con latidos cada 10 s.`,
    '',
    `Memoria del servidor (rss): pico desde el arranque ${mb(result.memory?.peakSinceStartMb ?? null)}` +
      ` · pico durante la prueba ${mb(result.memory?.peakDuringTestMb ?? null)}` +
      ` · al final de las sesiones ${mb(result.memory?.endOfHoldMb ?? null)}.`,
    '',
    `- ${mark(v.latency)} p95 del login (fase 1) < ${String(LOGIN_P95_LIMIT_MS)} ms`,
    `- ${mark(v.memory)} rss máximo < ${String(RSS_LIMIT_MB)} MB`,
    `- ${mark(result.errors.length === 0)} sin errores`,
    ...result.errors.map((e) => `  - ${e}`),
  ];
  return lines.join('\n');
}
