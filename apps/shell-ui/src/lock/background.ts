// URL del fondo de bloqueo personalizado (REQ-003-73). Las imágenes que el agente verificó las sirve el
// host nativo desde una carpeta de solo lectura, mapeada a un host propio. La CSP del Shell (`img-src`,
// `vite.config.ts`) admite exactamente este host.
import { type LockBackgroundImage, sha256HexSchema } from '@pope/shared';

const BACKGROUND_HOST = 'background.pope.invalid';

/**
 * La URL de la imagen, o `null` si no hay (el fondo de Pope) o si la huella no es una huella: el
 * nombre del archivo nunca sale de texto que no se haya validado.
 */
export function backgroundUrl(image: LockBackgroundImage | null): string | null {
  if (image === null || !sha256HexSchema.safeParse(image.sha256).success) return null;
  return `https://${BACKGROUND_HOST}/${image.sha256}.webp`;
}
