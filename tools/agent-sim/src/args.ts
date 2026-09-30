// Lectura de los argumentos de la línea de comandos, con errores en español.
import { MAX_DEV_PCS, type Micros, usd } from '@pope/shared';

/** Un argumento mal escrito: la CLI muestra el mensaje y sale sin más ruido. */
export class UsageError extends Error {}

/**
 * Números de PC de un texto: `5`, `1-5`, `1,3,7` o combinaciones (`1-3,7`). Devuelve la lista
 * ordenada y sin repetidos. Solo valen PCs de 1 a 99.
 */
export function parsePcRange(text: string): number[] {
  const result = new Set<number>();
  for (const part of text.split(',')) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!match) {
      throw new UsageError(`Rango de PCs no válido: "${text}" (usa 1-5 o 1,3,7)`);
    }
    const from = Number(match[1]);
    const to = match[2] === undefined ? from : Number(match[2]);
    if (from > to) {
      throw new UsageError(
        `El rango ${String(from)}-${String(to)} está al revés (usa ${String(to)}-${String(from)})`,
      );
    }
    for (const n of [from, to]) {
      if (n < 1 || n > MAX_DEV_PCS) {
        throw new UsageError(`La PC ${String(n)} no existe (de 1 a ${String(MAX_DEV_PCS)})`);
      }
    }
    for (let n = from; n <= to; n++) {
      result.add(n);
    }
  }
  return [...result].sort((a, b) => a - b);
}

/** Importe en USD escrito como `3` o `0.05` (o con coma), pasado a µUSD. Debe ser positivo. */
export function parseUsdAmount(text: string): Micros {
  const value = Number(text.trim().replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) {
    throw new UsageError(`Importe no válido: "${text}" (p. ej. 3 o 0.50)`);
  }
  return usd(value);
}

/** Entero positivo de un argumento (`--customers 5`). */
export function parsePositiveInt(text: string, option: string): number {
  const value = Number(text);
  if (!Number.isInteger(value) || value < 1) {
    throw new UsageError(`${option} debe ser un número entero mayor que 0 (recibí "${text}")`);
  }
  return value;
}

/** Usuario de prueba de la PC `n`: `sim05`. Es también el de su cliente. */
export function simUsername(n: number): string {
  return `sim${String(n).padStart(2, '0')}`;
}

/** Contraseña fija de todos los clientes de prueba. */
export const SIM_PASSWORD = 'sim1234';
