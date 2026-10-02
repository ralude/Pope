// Pestaña «Organizar» del mapa (T39b, REQ-001-45): el administrador arrastra cada PC a su
// casilla con `@dnd-kit/core`, con el ratón o con el teclado. Solo cambia la distribución en
// edición; guardarla o descartarla lo decide `MapPage`.
import {
  type Announcements,
  closestCenter,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  type KeyboardCoordinateGetter,
  PointerSensor,
  pointerWithin,
  type UniqueIdentifier,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { PcMapItem } from '@pope/shared';
import type { ReactNode } from 'react';

import {
  type Cell,
  cellId,
  MAP_COLUMNS,
  neighborCell,
  parseCellId,
  type PlacedPc,
  tileKind,
  tileLabel,
} from './model.js';

/** Margen superior de la baldosa dentro de su casilla (`.map-cell`), para centrarla al mover. */
const CELL_PADDING_TOP = 6;

const position = (cell: Cell) => `fila ${String(cell.row + 1)}, columna ${String(cell.col + 1)}`;

export function OrganizeGrid({
  placed,
  rows,
  onMove,
}: {
  placed: readonly PlacedPc[];
  rows: number;
  onMove: (pcId: string, target: Cell) => void;
}) {
  const nameOf = (id: UniqueIdentifier) => placed.find((p) => p.pc.id === id)?.pc.name ?? 'La PC';

  // Con el teclado, cada flecha lleva la PC a la casilla vecina (en vez de 25 px, lo que
  // hace `@dnd-kit` por defecto) y la deja centrada en ella.
  const coordinateGetter: KeyboardCoordinateGetter = (event, { context }) => {
    const from = parseCellId(context.over?.id);
    const to = from ? neighborCell(from, event.code, rows) : null;
    const rect = to ? context.droppableRects.get(cellId(to)) : undefined;
    if (!rect || !context.collisionRect) {
      return undefined;
    }
    event.preventDefault();
    return {
      x: rect.left + (rect.width - context.collisionRect.width) / 2,
      y: rect.top + CELL_PADDING_TOP,
    };
  };

  // Con el ratón manda la casilla bajo el puntero; con el teclado no hay puntero y se toma
  // la casilla más cercana a la baldosa.
  const collisionDetection: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    return hits.length > 0 ? hits : closestCenter(args);
  };

  const sensors = useSensors(
    // Unos píxeles de margen: un clic sin querer no empieza a arrastrar.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter }),
  );

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Has tomado ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) => {
      const cell = parseCellId(over?.id);
      return cell ? `${nameOf(active.id)} sobre la ${position(cell)}.` : undefined;
    },
    onDragEnd: ({ active, over }) => {
      const cell = parseCellId(over?.id);
      return cell
        ? `${nameOf(active.id)} soltada en la ${position(cell)}.`
        : `${nameOf(active.id)} se queda donde estaba.`;
    },
    onDragCancel: ({ active }) => `Cancelado. ${nameOf(active.id)} se queda donde estaba.`,
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const target = parseCellId(over?.id);
    if (target && typeof active.id === 'string') {
      onMove(active.id, target);
    }
  };

  const byCell = new Map(placed.map((p) => [cellId(p), p.pc]));
  const cells: ReactNode[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < MAP_COLUMNS; col++) {
      const pc = byCell.get(cellId({ row, col }));
      cells.push(
        <DropCell key={cellId({ row, col })} cell={{ row, col }}>
          {pc && <DragTile pc={pc} />}
        </DropCell>,
      );
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'Para mover una PC, pulsa Espacio o Intro, llévala con las flechas y suéltala con Espacio o Intro. Escape cancela.',
        },
      }}
    >
      <div
        className="map-grid"
        style={{
          gridTemplateColumns: `repeat(${String(MAP_COLUMNS)}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${String(rows)}, 96px)`,
        }}
      >
        {cells}
      </div>
    </DndContext>
  );
}

function DropCell({ cell, children }: { cell: Cell; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId(cell) });
  return (
    <div
      ref={setNodeRef}
      className={`map-cell${isOver ? ' cell-over' : ''}`}
      style={{ gridRow: cell.row + 1, gridColumn: cell.col + 1 }}
    >
      {children ?? <div className="cell-slot" aria-hidden="true" />}
    </div>
  );
}

function DragTile({ pc }: { pc: PcMapItem }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: pc.id,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`tile tile-${tileKind(pc)} tile-draggable${isDragging ? ' tile-dragging' : ''}`}
      style={
        transform
          ? { transform: `translate3d(${String(transform.x)}px, ${String(transform.y)}px, 0)` }
          : undefined
      }
      {...attributes}
      {...listeners}
      aria-label={`${pc.name}, mover`}
    >
      {tileLabel(pc.name)}
    </button>
  );
}
