// Reportes del cierre en PDF (REQ-005-51 a REQ-005-53), con pdfkit: JavaScript puro y las
// fuentes estándar de PDF, que traen tildes y eñes (plan 005). Sin colores: se imprimen.
import {
  type CashMethod,
  type CashMovement,
  formatMoney,
  formatVes,
  type Micros,
  methodCurrency,
  micros,
  type PaymentMethod,
  paymentMethodSchema,
} from '@pope/shared';
import PDFDocument from 'pdfkit';

import type { ShiftReport } from './shift-report.service.js';

const MARGIN = 40;
const PAGE_WIDTH = 595.28; // A4 en puntos
const PAGE_BOTTOM = 841.89 - MARGIN;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
/** Ancho de la etiqueta en las filas de dos columnas; el importe ocupa el resto. */
const LABEL_WIDTH = 330;
const ZONE = 'America/Caracas';

const METHOD_LABEL: Record<CashMethod, string> = {
  cash_usd: 'Efectivo USD',
  cash_ves: 'Efectivo Bs',
  mobile_payment: 'Pago móvil',
  pos: 'Punto de venta',
  balance: 'Con saldo',
};

const day = new Intl.DateTimeFormat('es-VE', { timeZone: ZONE, dateStyle: 'full' });
const time = new Intl.DateTimeFormat('es-VE', {
  timeZone: ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const dateTime = new Intl.DateTimeFormat('es-VE', {
  timeZone: ZONE,
  dateStyle: 'short',
  timeStyle: 'short',
  hour12: false,
});

/** Un importe en la moneda en que se cuenta cada método. */
function amountIn(method: CashMethod, amount: number): string {
  return methodCurrency(method) === 'VES' ? formatVes(micros(amount)) : formatMoney(micros(amount));
}

/** Una celda de una fila: texto, ancho y alineación. */
interface Cell {
  text: string;
  width: number;
  align?: 'left' | 'right';
}

/** Dibuja un PDF y lo devuelve entero. Sin comprimir: es pequeño y se lee en los tests. */
function render(draw: (doc: PDFKit.PDFDocument) => void, title: string): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    compress: false,
    info: { Title: title, Producer: 'Pope', Creator: 'Pope' },
  });
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', reject);
    draw(doc);
    doc.end();
  });
}

class Writer {
  y = MARGIN;

  constructor(private readonly doc: PDFKit.PDFDocument) {}

  /** Salta de página si no caben `height` puntos más. */
  ensure(height: number): void {
    if (this.y + height > PAGE_BOTTOM) {
      this.doc.addPage();
      this.y = MARGIN;
    }
  }

  line(text: string, size = 10, bold = false, gap = 4): void {
    this.ensure(size + gap);
    this.doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(size)
      .text(text, MARGIN, this.y, { width: CONTENT_WIDTH, lineBreak: false });
    this.y += size + gap;
  }

  heading(text: string): void {
    this.y += 8;
    this.line(text, 12, true, 6);
  }

  row(cells: readonly Cell[], bold = false, size = 9): void {
    this.ensure(size + 5);
    let x = MARGIN;
    this.doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
    for (const cell of cells) {
      if (cell.text === '') {
        x += cell.width;
        continue;
      }
      this.doc.text(cell.text, x, this.y, {
        width: cell.width,
        align: cell.align ?? 'left',
        lineBreak: false,
        ellipsis: true,
      });
      x += cell.width;
    }
    this.y += size + 5;
  }

  rule(): void {
    this.doc
      .moveTo(MARGIN, this.y)
      .lineTo(MARGIN + CONTENT_WIDTH, this.y)
      .lineWidth(0.5)
      .stroke();
    this.y += 4;
  }
}

/** El resumen de una página (REQ-005-51): lo vendido por grupo, lo pagado con saldo y el cuadre. */
function drawSummary(w: Writer, report: ShiftReport): void {
  const { summary } = report;
  const opened = new Date(summary.openedAt);
  const closed = summary.closedAt === null ? null : new Date(summary.closedAt);

  w.line(report.localName, 18, true, 6);
  w.line(`Cierre de caja · ${day.format(opened)}`, 12, false, 10);
  w.line(`Encargado: ${summary.staffName}`);
  w.line(
    `Apertura: ${time.format(opened)} · Cierre: ${closed ? time.format(closed) : 'caja abierta'}` +
      (report.closedByName ? ` · Cerró: ${report.closedByName}` : ''),
  );

  w.heading('Lo vendido');
  const sold: [string, Micros][] = [
    ['Horas de PC', summary.totals.pc],
    ['Golosinas', summary.totals.snacks],
    ['Otras ventas', summary.totals.other],
  ];
  for (const [label, amount] of sold) {
    w.row([
      { text: label, width: LABEL_WIDTH },
      { text: formatMoney(amount), width: CONTENT_WIDTH - LABEL_WIDTH, align: 'right' },
    ]);
  }
  w.rule();
  w.row(
    [
      { text: 'Total', width: LABEL_WIDTH },
      {
        text: formatMoney(summary.totals.total),
        width: CONTENT_WIDTH - LABEL_WIDTH,
        align: 'right',
      },
    ],
    true,
    11,
  );
  w.y += 4;
  w.row([
    { text: 'Pagado con saldo (no entra en la caja)', width: LABEL_WIDTH },
    {
      text: formatMoney(summary.totals.balance),
      width: CONTENT_WIDTH - LABEL_WIDTH,
      align: 'right',
    },
  ]);
  if (report.rate !== null) {
    w.row([
      { text: 'Tasa aplicada', width: LABEL_WIDTH },
      {
        text: `${formatVes(micros(report.rate))} por USD`,
        width: CONTENT_WIDTH - LABEL_WIDTH,
        align: 'right',
      },
    ]);
  }

  w.heading('Cuadre por método');
  const widths = [125, 100, 100, 100, 90];
  w.row(
    ['Método', 'Fondo', 'Esperado', 'Contado', 'Diferencia'].map((text, i) => ({
      text,
      width: widths[i] ?? 0,
      align: i === 0 ? 'left' : 'right',
    })),
    true,
  );
  w.rule();
  for (const method of paymentMethodSchema.options) {
    w.row(methodRow(method, report, widths));
  }
}

function methodRow(method: PaymentMethod, report: ShiftReport, widths: number[]): Cell[] {
  const { summary } = report;
  const opening =
    method === 'cash_usd'
      ? summary.opening.cashUsdMicros
      : method === 'cash_ves'
        ? summary.opening.cashVesMicros
        : null;
  const cell = (value: number | null | undefined) =>
    value === null || value === undefined ? '—' : amountIn(method, value);
  return [
    { text: METHOD_LABEL[method], width: widths[0] ?? 0 },
    { text: cell(opening), width: widths[1] ?? 0, align: 'right' },
    { text: cell(summary.expected?.[method]), width: widths[2] ?? 0, align: 'right' },
    { text: cell(summary.counted?.[method]), width: widths[3] ?? 0, align: 'right' },
    { text: cell(summary.difference?.[method]), width: widths[4] ?? 0, align: 'right' },
  ];
}

function paymentsText(movement: CashMovement): string {
  return movement.payments
    .map((p) => `${METHOD_LABEL[p.method]} ${amountIn(p.method, p.amountMicros)}`)
    .join(' + ');
}

/** Lo que añade el detallado (REQ-005-53): movimientos, anulaciones y stock por producto. */
/**
 * Lo vendido por artículo (REQ-005-51), como el Z-Report de SENET: golosinas y otras ventas,
 * con las unidades vendidas y lo que queda en almacén. Si no cabe, sigue en otra página.
 */
function drawSold(w: Writer, report: ShiftReport): void {
  w.heading('Lo vendido por artículo');
  const widths = [315, 100, 100];
  w.row(
    ['Artículo', 'Cantidad vendida', 'En almacén'].map((text, i) => ({
      text,
      width: widths[i] ?? 0,
      align: i === 0 ? 'left' : 'right',
    })),
    true,
  );
  w.rule();
  for (const line of report.sold) {
    w.row([
      { text: line.name, width: widths[0] ?? 0 },
      { text: String(line.quantity), width: widths[1] ?? 0, align: 'right' },
      {
        text: line.inStock === null ? '—' : String(line.inStock),
        width: widths[2] ?? 0,
        align: 'right',
      },
    ]);
  }
  if (report.sold.length === 0) {
    w.line('No se vendieron golosinas ni otras ventas.', 9);
  }
}

function drawDetail(w: Writer, report: ShiftReport): void {
  w.heading('Movimientos de la caja');
  // Entre el importe (a la derecha) y el pago va una columna vacía de separación.
  const widths = [40, 180, 75, 12, 135, 73];
  w.row(
    ['Hora', 'Qué', 'Importe', '', 'Pago', 'Quién'].map((text, i) => ({
      text,
      width: widths[i] ?? 0,
      align: i === 2 ? 'right' : 'left',
    })),
    true,
  );
  w.rule();
  for (const movement of report.movements) {
    w.row([
      { text: time.format(new Date(movement.at)), width: widths[0] ?? 0 },
      {
        text: movement.voided ? `${movement.description} (anulada)` : movement.description,
        width: widths[1] ?? 0,
      },
      { text: formatMoney(movement.usdMicros), width: widths[2] ?? 0, align: 'right' },
      { text: '', width: widths[3] ?? 0 },
      { text: paymentsText(movement), width: widths[4] ?? 0 },
      { text: movement.actorName, width: widths[5] ?? 0 },
    ]);
  }
  if (report.movements.length === 0) {
    w.line('Sin movimientos.', 9);
  }

  const voids = report.movements.filter((m) => m.source === 'void');
  w.heading('Anulaciones');
  for (const movement of voids) {
    w.line(
      `${time.format(new Date(movement.at))} · ${movement.description} · ${formatMoney(movement.usdMicros)} · ` +
        `Motivo: ${movement.reason ?? ''} · ${movement.actorName}`,
      9,
    );
  }
  if (voids.length === 0) {
    w.line('Sin anulaciones.', 9);
  }

  w.heading('Stock por producto');
  const stockWidths = [165, 55, 55, 55, 55, 55, 75];
  w.row(
    ['Producto', 'Inicial', 'Entradas', 'Ventas', 'Ajustes', 'Mermas', 'Final'].map((text, i) => ({
      text,
      width: stockWidths[i] ?? 0,
      align: i === 0 ? 'left' : 'right',
    })),
    true,
  );
  w.rule();
  for (const line of report.stock) {
    const values = [
      line.initial,
      line.restocked,
      line.sold,
      line.adjusted,
      line.wasted,
      line.final,
    ];
    w.row([
      { text: line.name, width: stockWidths[0] ?? 0 },
      ...values.map((value, i): Cell => ({
        text: String(value),
        width: stockWidths[i + 1] ?? 0,
        align: 'right',
      })),
    ]);
  }
  if (report.stock.length === 0) {
    w.line('Sin productos.', 9);
  }
}

/**
 * El PDF del cierre. En el del encargado (`full = false`) los totales y el cuadre caben
 * siempre en la primera página; después va lo vendido por artículo, que puede seguir en otra,
 * y nunca la lista de movimientos (plan 005, riesgos). El detallado añade lo demás.
 */
export function renderShiftReport(report: ShiftReport, full: boolean): Promise<Buffer> {
  const title = full ? 'Cierre de caja detallado' : 'Cierre de caja';
  return render((doc) => {
    const w = new Writer(doc);
    drawSummary(w, report);
    drawSold(w, report);
    if (full) {
      drawDetail(w, report);
    }
    w.y = Math.max(w.y + 12, PAGE_BOTTOM - 12);
    w.ensure(12);
    w.line(`Generado por Pope el ${dateTime.format(report.generatedAt)}`, 8);
  }, title);
}
