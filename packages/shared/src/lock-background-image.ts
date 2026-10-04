// Metadatos sin actor ni bytes, reutilizados en protocolo y auditoría (REQ-003-71).
import { z } from 'zod';

export const MAX_BACKGROUND_SOURCE_BYTES = 10_000_000;
export const MAX_BACKGROUND_SOURCE_PIXELS = 40_000_000;
export const MAX_BACKGROUND_BYTES = 2_000_000;
export const MAX_BACKGROUND_WIDTH = 1_920;
export const MAX_BACKGROUND_HEIGHT = 1_080;
export const backgroundSourceMimeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp']);
export const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const lockBackgroundImageSchema = z.strictObject({
  sha256: sha256HexSchema,
  size: z.int().positive().max(MAX_BACKGROUND_BYTES),
  mimeType: z.literal('image/webp'),
  width: z.int().positive().max(MAX_BACKGROUND_WIDTH),
  height: z.int().positive().max(MAX_BACKGROUND_HEIGHT),
});
export type LockBackgroundImage = z.infer<typeof lockBackgroundImageSchema>;

/** Límites del original tras leer sus encabezados, antes de reservar memoria de imagen. */
export function isBackgroundSourceWithinLimits(
  size: number,
  width: number,
  height: number,
): boolean {
  return (
    Number.isSafeInteger(size) &&
    size > 0 &&
    size <= MAX_BACKGROUND_SOURCE_BYTES &&
    Number.isSafeInteger(width) &&
    width > 0 &&
    Number.isSafeInteger(height) &&
    height > 0 &&
    width <= MAX_BACKGROUND_SOURCE_PIXELS / height
  );
}
