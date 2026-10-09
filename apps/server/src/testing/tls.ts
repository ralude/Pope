import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Certificados efímeros: ni claves versionadas ni cambios en el almacén de Windows. */
export async function createTlsFixture(): Promise<{
  certFile: string;
  keyFile: string;
  cert: Buffer;
  expiredFile: string;
  close(): Promise<void>;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'pope-tls-'));
  const certFile = join(directory, 'cert.pem');
  const keyFile = join(directory, 'key.pem');
  const expiredFile = join(directory, 'expired.pem');
  const gitOpenSsl = 'C:/Program Files/Git/usr/bin/openssl.exe';
  const openssl = process.env.OPENSSL_PATH ?? (existsSync(gitOpenSsl) ? gitOpenSsl : 'openssl');
  const run = (args: string[]) => execFileSync(openssl, args, { stdio: 'ignore', timeout: 15_000 });
  try {
    run([
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-sha256',
      '-days',
      '2',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1',
      '-keyout',
      keyFile,
      '-out',
      certFile,
    ]);
    run([
      'x509',
      '-in',
      certFile,
      '-signkey',
      keyFile,
      '-not_before',
      '20000101000000Z',
      '-not_after',
      '20010101000000Z',
      '-out',
      expiredFile,
    ]);
    return {
      certFile,
      keyFile,
      expiredFile,
      cert: await readFile(certFile),
      close: () => rm(directory, { recursive: true, force: true }),
    };
  } catch {
    await rm(directory, { recursive: true, force: true });
    throw new Error('La prueba TLS necesita OpenSSL en PATH, OPENSSL_PATH o Git for Windows.');
  }
}
