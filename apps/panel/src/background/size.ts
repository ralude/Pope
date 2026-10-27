import { MAX_BACKGROUND_HEIGHT, MAX_BACKGROUND_WIDTH } from '@pope/shared';

/**
 * Tamaño al que se reduce el fondo (REQ-003-76): cabe en 1920×1080, conserva la proporción
 * y nunca se amplía. Un lado nunca queda en 0, aunque la imagen sea una tira muy fina.
 */
export function backgroundSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_BACKGROUND_WIDTH / width, MAX_BACKGROUND_HEIGHT / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
