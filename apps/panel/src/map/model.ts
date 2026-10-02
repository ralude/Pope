// Lógica del mapa de PCs (T39), sin React: dónde va cada PC, qué estado muestra y cuánto le
// queda ahora mismo. Así se puede probar sin navegador.
import {
  type AccountBalances,
  applyCheckpoint,
  type PcMapItem,
  type PcMapSession,
  seconds,
  startUsage,
} from '@pope/shared';

/** Columnas del mapa (diseño de referencia: 14 × 7 casillas en la pantalla de 1920×1080). */
export const MAP_COLUMNS = 14;

/** Estado que pinta la baldosa. */
export type TileKind = 'account' | 'temporary' | 'free' | 'offline';

/**
 * Con sesión manda la sesión, aunque la PC esté desconectada: sigue abierta durante el tiempo
 * de gracia (REQ-001-27).
 */
export function tileKind(pc: PcMapItem): TileKind {
  if (pc.session) {
    return pc.session.kind === 'account' ? 'account' : 'temporary';
  }
  return pc.connected ? 'free' : 'offline';
}

export interface PlacedPc {
  pc: PcMapItem;
  row: number;
  col: number;
}

const cellKey = (row: number, col: number) => `${String(row)}:${String(col)}`;

/**
 * Coloca cada PC en el mapa: en su posición guardada si la tiene (REQ-001-45) y, si no, en
 * las casillas libres siguientes, por orden de número, a partir de la última fila ocupada.
 */
export function placePcs(pcs: readonly PcMapItem[], columns = MAP_COLUMNS): PlacedPc[] {
  const taken = new Set<string>();
  const placed: PlacedPc[] = [];
  const unplaced: PcMapItem[] = [];
  let lastRow = -1;
  for (const pc of pcs) {
    if (pc.row !== null && pc.col !== null && pc.col < columns) {
      taken.add(cellKey(pc.row, pc.col));
      placed.push({ pc, row: pc.row, col: pc.col });
      lastRow = Math.max(lastRow, pc.row);
    } else {
      unplaced.push(pc);
    }
  }
  unplaced.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
  let cursor = (lastRow + 1) * columns;
  for (const pc of unplaced) {
    while (taken.has(cellKey(Math.floor(cursor / columns), cursor % columns))) {
      cursor += 1;
    }
    placed.push({ pc, row: Math.floor(cursor / columns), col: cursor % columns });
    cursor += 1;
  }
  return placed;
}

/**
 * Segundos de uso desde el último cobro del nodo. Si la PC no está conectada, el nodo no cobra
 * el hueco (REQ-001-27), así que tampoco se cuenta aquí.
 */
function elapsedSince(session: PcMapSession, connected: boolean, now: Date): number {
  if (!connected) {
    return 0;
  }
  return Math.max(0, Math.floor((now.getTime() - Date.parse(session.billedUntil)) / 1000));
}

/** Restante en vivo: el que dio el nodo menos el tiempo pasado desde que lo cobró. */
export function liveRemaining(session: PcMapSession, connected: boolean, now: Date): number {
  return Math.max(0, session.remainingSeconds - elapsedSince(session, connected, now));
}

/**
 * Saldos en vivo de una sesión con cuenta, solo para mostrar: aplica el uso desde el último
 * cobro con el mismo motor que el nodo (primero las horas de combo, luego el dinero). El
 * cobro de verdad lo hace el nodo (ADR-0007); el siguiente envío corrige cualquier diferencia.
 */
export function liveAccount(session: PcMapSession, connected: boolean, now: Date): AccountBalances {
  const balances: AccountBalances = {
    moneyMicros: session.amountMicros,
    comboSeconds: session.comboSeconds,
  };
  const elapsed = elapsedSince(session, connected, now);
  if (elapsed === 0 || session.rateMicrosPerHour <= 0) {
    return balances;
  }
  return applyCheckpoint(startUsage(session.rateMicrosPerHour), balances, seconds(elapsed)).live;
}

/** Lo que se lee en la baldosa: el número de la PC (`PC 05` → `5`), o el nombre si no lo tiene. */
export function tileLabel(name: string): string {
  const match = /(\d+)\s*$/.exec(name);
  return match?.[1] === undefined ? name : String(Number(match[1]));
}

/** Restante corto para la baldosa: `1:58` (horas y minutos). */
export function shortDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(Math.floor(minutes / 60))}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Con 5 min o menos, la raya roja (REQ-001-24). */
export const ENDING_SECONDS = 5 * 60;

/** Recuentos de la leyenda. Cada PC cuenta en un solo estado; `ending` va aparte. */
export interface Legend extends Record<TileKind, number> {
  ending: number;
  /** PCs con sesión, de `total`. */
  occupied: number;
  total: number;
}

export function legendOf(pcs: readonly PcMapItem[], now: Date): Legend {
  const legend: Legend = {
    account: 0,
    temporary: 0,
    free: 0,
    offline: 0,
    ending: 0,
    occupied: 0,
    total: pcs.length,
  };
  for (const pc of pcs) {
    legend[tileKind(pc)] += 1;
    if (pc.session) {
      legend.occupied += 1;
      if (liveRemaining(pc.session, pc.connected, now) <= ENDING_SECONDS) legend.ending += 1;
    }
  }
  return legend;
}
