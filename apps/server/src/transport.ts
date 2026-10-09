import { createPrivateKey, X509Certificate } from 'node:crypto';
import { open } from 'node:fs/promises';
import { createSecureContext, type SecureContextOptions } from 'node:tls';

import { FastifyAdapter } from '@nestjs/platform-fastify';

import type { AppConfig } from './config.js';

/** Lectura acotada: nunca cargar un archivo arbitrariamente grande por mala configuración. */
async function readPem(path: string): Promise<Buffer> {
  const file = await open(path, 'r');
  try {
    const bytes = Buffer.alloc(65_537);
    const { bytesRead } = await file.read(bytes);
    if (bytesRead === 0 || bytesRead > 65_536) {
      throw new Error('Tamaño PEM no admitido');
    }
    return bytes.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

/** REQ-003-63: fallar antes de escuchar, sin revelar PEM ni errores de OpenSSL. */
export async function loadNodeTls(config: AppConfig): Promise<SecureContextOptions | null> {
  if (!config.tls) {
    if (config.mode === 'local' && !['127.0.0.1', '::1'].includes(config.host)) {
      throw new Error('El nodo local exige TLS en la LAN; para desarrollo usa HOST=127.0.0.1.');
    }
    return null;
  }
  try {
    const [cert, key] = await Promise.all([
      readPem(config.tls.certFile),
      readPem(config.tls.keyFile),
    ]);
    const certificate = new X509Certificate(cert);
    const now = Date.now();
    if (
      now < Date.parse(certificate.validFrom) ||
      now >= Date.parse(certificate.validTo) ||
      !certificate.checkPrivateKey(createPrivateKey(key))
    ) {
      throw new Error('Certificado fuera de vigencia o clave distinta');
    }
    const options: SecureContextOptions = { cert, key, minVersion: 'TLSv1.2' };
    createSecureContext(options);
    return options;
  } catch {
    throw new Error(
      'TLS no válido: revisa POPE_TLS_CERT_FILE y POPE_TLS_KEY_FILE, su vigencia y permisos.',
    );
  }
}

/** HTTPS y WSS comparten este socket. No registrar cuerpos, cabeceras ni secretos. */
export async function createNodeAdapter(config: AppConfig): Promise<FastifyAdapter> {
  const https = await loadNodeTls(config);
  return https
    ? new FastifyAdapter({ https, logger: false })
    : new FastifyAdapter({ logger: false });
}
