// PCs de ejemplo para desarrollo y para el simulador de PCs (T35a, T36). El registro real de
// las PCs, con código de instalación, es la spec 003.

/** Cuántas PCs de ejemplo se pueden crear como máximo: "PC 01" … "PC 99". */
export const MAX_DEV_PCS = 99;

function assertDevPcNumber(n: number): void {
  if (!Number.isInteger(n) || n < 1 || n > MAX_DEV_PCS) {
    throw new RangeError(`Número de PC no válido: ${String(n)} (de 1 a ${String(MAX_DEV_PCS)})`);
  }
}

/**
 * Id fijo de la PC de ejemplo número `n` (1…99), un UUIDv7 válido. Así el simulador y el
 * servidor conocen los ids sin consultar la base de datos.
 */
export function devPcId(n: number): string {
  assertDevPcNumber(n);
  return `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;
}

/** Nombre de la PC de ejemplo número `n` (1…99): "PC 05". */
export function devPcName(n: number): string {
  assertDevPcNumber(n);
  return `PC ${String(n).padStart(2, '0')}`;
}
