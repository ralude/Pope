// Lógica del mapa de PCs (T39), sin React: dónde va cada PC, qué estado muestra y cuánto le
// queda ahora mismo. Así se puede probar sin navegador.
import {
  type AccountBalances,
  applyCheckpoint,
  formatLocalTime,
  type PausesUsed,
  type PcMapItem,
  type PcMapSession,
  PC_MAP_COLUMNS,
  PC_MAP_MAX_ROWS,
  pauseSecondsLeft,
  seconds,
  startUsage,
} from '@pope/shared';

/** Columnas del mapa: las mismas que acepta el nodo al guardar la distribución. */
export const MAP_COLUMNS = PC_MAP_COLUMNS;

/** Estado que pinta la baldosa. */
export type TileKind = 'account' | 'temporary' | 'paused' | 'free' | 'offline';

/**
 * Con sesión manda la sesión, aunque la PC esté desconectada: sigue abierta durante el tiempo
 * de gracia (REQ-001-27). Una sesión en pausa va en morado (REQ-002-14).
 */
export function tileKind(pc: PcMapItem): TileKind {
  if (pc.session) {
    if (pc.session.pause) return 'paused';
    return pc.session.kind === 'account' ? 'account' : 'temporary';
  }
  return pc.connected ? 'free' : 'offline';
}

/**
 * La sesión está en una pausa que aún no cobra: su tiempo no corre (REQ-002-03). Si venció
 * con la opción a), ya cobra aunque la PC siga en pausa (CA-002-05).
 */
export function onHold(session: PcMapSession): boolean {
  return session.pause !== null && !session.pause.billing;
}

/** Segundos de pausa que quedan ahora (REQ-002-14). */
export function pauseLeft(session: PcMapSession, now: Date): number {
  return session.pause ? pauseSecondsLeft(new Date(session.pause.maxUntil), now) : 0;
}

/**
 * La pausa en el detalle de la PC (REQ-002-13, CA-002-08): «En pausa desde las 18:29 ·
 * quedan 12 min»; si ya cobra, «… · venció a las 18:44».
 */
export function pauseLine(session: PcMapSession, now: Date): string {
  const pause = session.pause;
  if (!pause) return '';
  const since = `En pausa desde las ${formatLocalTime(new Date(pause.startedAt))}`;
  return pause.billing
    ? `${since} · venció a las ${formatLocalTime(new Date(pause.maxUntil))}`
    : `${since} · quedan ${pauseMinutes(pauseLeft(session, now))}`;
}

/**
 * Pausas usadas, con los límites del local si se conocen: «Pausas usadas: 1 de 3 en la
 * sesión · 2 de 5 hoy» (REQ-002-21, REQ-002-24).
 */
export function pausesUsedLine(
  used: PausesUsed,
  limits: { perSession: number; perDay: number } | null,
): string {
  const of = (n: number, limit: number | undefined) =>
    limit === undefined ? String(n) : `${String(n)} de ${String(limit)}`;
  return `Pausas usadas: ${of(used.inSession, limits?.perSession)} en la sesión · ${of(used.today, limits?.perDay)} hoy`;
}

/** Minutos de pausa para la baldosa y el detalle, redondeando hacia arriba: `12 min`. */
export function pauseMinutes(totalSeconds: number): string {
  return `${String(Math.ceil(totalSeconds / 60))} min`;
}

/**
 * Texto bajo la baldosa: el restante de la sesión (`1:58`); en pausa, lo que queda de pausa
 * (`12 min`), salvo si ya cobra, que vuelve a ser el restante, porque baja.
 */
export function tileSub(pc: PcMapItem, now: Date): string {
  const session = pc.session;
  if (!session) return '';
  if (onHold(session)) return pauseMinutes(pauseLeft(session, now));
  return shortDuration(liveRemaining(session, pc.connected, now));
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

// ─── Organizar el mapa (T39b, REQ-001-45) ─────────────────────────────────────────────────

export interface Cell {
  row: number;
  col: number;
}

/** Distribución en edición: la casilla de cada PC, por id. */
export type Layout = ReadonlyMap<string, Cell>;

/** Filas mínimas del mapa, como en el diseño (14 × 7). */
export const MIN_ROWS = 7;

export const layoutOf = (placed: readonly PlacedPc[]): Layout =>
  new Map(placed.map(({ pc, row, col }) => [pc.id, { row, col }]));

/** Las PCs con la casilla de la distribución en edición, para `placePcs`. */
export function withLayout(pcs: readonly PcMapItem[], layout: Layout | null): PcMapItem[] {
  if (!layout) return [...pcs];
  return pcs.map((pc) => {
    const cell = layout.get(pc.id);
    return cell ? { ...pc, row: cell.row, col: cell.col } : pc;
  });
}

/**
 * Filas al organizar: las del diseño o, si el mapa ocupa más, una vacía de sobra para poder
 * bajar PCs; nunca más de las que acepta el nodo.
 */
export function organizeRows(placed: readonly PlacedPc[]): number {
  const used = Math.max(0, ...placed.map((p) => p.row + 1));
  return Math.min(PC_MAP_MAX_ROWS, Math.max(MIN_ROWS, used + 1));
}

/** Lleva una PC a una casilla; si estaba ocupada, la otra PC pasa a la casilla que queda libre. */
export function moveTo(layout: Layout, pcId: string, target: Cell): Map<string, Cell> {
  const next = new Map(layout);
  const from = layout.get(pcId);
  if (!from) return next;
  for (const [otherId, cell] of layout) {
    if (otherId !== pcId && cell.row === target.row && cell.col === target.col) {
      next.set(otherId, from);
    }
  }
  next.set(pcId, { row: target.row, col: target.col });
  return next;
}

/** Cuántas PCs tienen en `layout` una casilla distinta de la de `placed`. */
export function movedCount(placed: readonly PlacedPc[], layout: Layout): number {
  return placed.filter(({ pc, row, col }) => {
    const cell = layout.get(pc.id);
    return cell !== undefined && (cell.row !== row || cell.col !== col);
  }).length;
}

/** Id de la casilla para `@dnd-kit` (`cell:2:5`) y su lectura inversa. */
export const cellId = (cell: Cell) => `cell:${String(cell.row)}:${String(cell.col)}`;

export function parseCellId(id: unknown): Cell | null {
  const match = typeof id === 'string' ? /^cell:(\d+):(\d+)$/.exec(id) : null;
  return match ? { row: Number(match[1]), col: Number(match[2]) } : null;
}

const STEPS: Record<string, Cell> = {
  ArrowUp: { row: -1, col: 0 },
  ArrowDown: { row: 1, col: 0 },
  ArrowLeft: { row: 0, col: -1 },
  ArrowRight: { row: 0, col: 1 },
};

/** La casilla vecina en la dirección de la flecha, o `null` en el borde (mover con teclado). */
export function neighborCell(
  cell: Cell,
  key: string,
  rows: number,
  columns = MAP_COLUMNS,
): Cell | null {
  const step = STEPS[key];
  if (!step) return null;
  const row = cell.row + step.row;
  const col = cell.col + step.col;
  return row < 0 || col < 0 || row >= rows || col >= columns ? null : { row, col };
}

/**
 * Segundos de uso desde el último cobro del nodo. Si la PC no está conectada, el nodo no cobra
 * el hueco (REQ-001-27), así que tampoco se cuenta aquí.
 */
function elapsedSince(session: PcMapSession, connected: boolean, now: Date): number {
  // En una pausa que no cobra tampoco corre (REQ-002-03).
  if (!connected || onHold(session)) {
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

/** Recuentos de la leyenda. Cada PC cuenta en un solo estado; `ending` y `pauseBilling` van aparte. */
export interface Legend extends Record<TileKind, number> {
  ending: number;
  /** En pausa que ya cobra (borde ámbar, CA-002-05); cuentan también en `paused`. */
  pauseBilling: number;
  /** PCs con sesión, de `total`. */
  occupied: number;
  total: number;
}

export function legendOf(pcs: readonly PcMapItem[], now: Date): Legend {
  const legend: Legend = {
    account: 0,
    temporary: 0,
    paused: 0,
    free: 0,
    offline: 0,
    ending: 0,
    pauseBilling: 0,
    occupied: 0,
    total: pcs.length,
  };
  for (const pc of pcs) {
    legend[tileKind(pc)] += 1;
    if (pc.session) {
      legend.occupied += 1;
      if (pc.session.pause?.billing) legend.pauseBilling += 1;
      if (isEnding(pc, now)) legend.ending += 1;
    }
  }
  return legend;
}

/**
 * Quedan 5 min o menos y el tiempo corre: la raya roja (REQ-001-24). En una pausa que no cobra
 * el tiempo está detenido, así que no se marca.
 */
export function isEnding(pc: PcMapItem, now: Date): boolean {
  const session = pc.session;
  if (!session || onHold(session)) return false;
  return liveRemaining(session, pc.connected, now) <= ENDING_SECONDS;
}
