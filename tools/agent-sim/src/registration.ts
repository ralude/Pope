// REQ-003-10/11/63: configuración exclusiva de pruebas; nunca la del agente Windows.
import { open, rename, rm } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { resolve } from 'node:path';
import { randomUUID, X509Certificate } from 'node:crypto';

import {
  pcCredentialSchema,
  pcInstallationCodeSchema,
  pcMacAddressInputSchema,
  pcRegistrationResponseSchema,
  registeredPcSchema,
} from '@pope/shared';
import { z } from 'zod';
import WebSocket from 'ws';

const profileSchema = z.strictObject({
  purpose: z.literal('simulator'),
  version: z.literal(1),
  nodeUrl: z.string(),
  caFile: z.string().nullable(),
  pcs: z
    .array(
      z.strictObject({
        number: z.number().int().min(1).max(99),
        pc: registeredPcSchema,
        credential: pcCredentialSchema,
      }),
    )
    .max(99),
});
export type SimulatorProfile = z.infer<typeof profileSchema>;
export type SimulatorIdentity = SimulatorProfile['pcs'][number];
export class SimulatorConfigError extends Error {}
const failure = () => new SimulatorConfigError('Configuración o registro del simulador no válido.');

/** Ni credenciales, query, fragmentos ni rutas arbitrarias en el destino de confianza. */
export function nodeUrl(value: string): URL {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/')
      throw failure();
    if (
      url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname))
    )
      throw failure();
    return url;
  } catch {
    throw failure();
  }
}

export async function readLimited(path: string, max: number): Promise<Buffer> {
  const file = await open(path, 'r');
  try {
    const bytes = Buffer.alloc(max + 1);
    const { bytesRead } = await file.read(bytes);
    if (bytesRead === 0 || bytesRead > max) throw failure();
    return bytes.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

function profilePath(path: string): string {
  if (!path.endsWith('.sim-secret.json')) throw failure();
  return resolve(path);
}

export async function readProfile(path: string): Promise<SimulatorProfile> {
  try {
    const profile = profileSchema.parse(
      JSON.parse((await readLimited(profilePath(path), 65_536)).toString('utf8')),
    );
    nodeUrl(profile.nodeUrl);
    if (
      new Set(profile.pcs.map((p) => p.number)).size !== profile.pcs.length ||
      new Set(profile.pcs.map((p) => p.pc.id)).size !== profile.pcs.length
    )
      throw failure();
    return profile;
  } catch {
    throw failure();
  }
}

/** Certificado proporcionado por un medio confiable; nunca aceptar el recibido en la conexión. */
export async function readTrustedCa(path: string | null): Promise<Buffer | undefined> {
  if (path === null) return undefined;
  try {
    const bytes = await readLimited(path, 65_536);
    const cert = new X509Certificate(bytes);
    if (Date.now() < Date.parse(cert.validFrom) || Date.now() >= Date.parse(cert.validTo))
      throw failure();
    return bytes;
  } catch {
    throw failure();
  }
}

async function postRegistration(url: URL, ca: Buffer | undefined, body: string): Promise<unknown> {
  return new Promise((resolveResponse, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        method: 'POST',
        ca,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 16_384) request.destroy(failure());
          else chunks.push(chunk);
        });
        response.on('error', () => {
          reject(failure());
        });
        response.on('end', () => {
          try {
            if (response.statusCode !== 201 || size > 16_384) throw failure();
            resolveResponse(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
          } catch {
            reject(failure());
          }
        });
      },
    );
    const timer = setTimeout(() => request.destroy(failure()), 10_000);
    request.on('close', () => {
      clearTimeout(timer);
    });
    request.on('error', () => {
      reject(failure());
    });
    request.end(body);
  });
}

/** Un uso: preparar ruta/confianza antes de consumir; si se pierde respuesta usar recuperación T12. */
export async function registerSimulator(options: {
  url: string;
  number: number;
  codeFile: string;
  macAddress: string;
  profileFile: string;
  caFile?: string;
}): Promise<SimulatorIdentity> {
  const temporary = `${profilePath(options.profileFile)}.${randomUUID()}.tmp`;
  const lockPath = `${profilePath(options.profileFile)}.lock`;
  let file;
  let lock;
  try {
    const destination = profilePath(options.profileFile);
    const url = nodeUrl(options.url);
    const caFile = options.caFile ? resolve(options.caFile) : null;
    const ca = await readTrustedCa(caFile);
    if (!options.codeFile.endsWith('.installation-code.txt')) throw failure();
    const installationCode = pcInstallationCodeSchema.parse(
      (await readLimited(options.codeFile, 128)).toString('utf8').trim(),
    );
    const macAddress = pcMacAddressInputSchema.parse(options.macAddress);
    if (!Number.isInteger(options.number) || options.number < 1 || options.number > 99)
      throw failure();
    lock = await open(lockPath, 'wx', 0o600);
    let profile: SimulatorProfile;
    try {
      const existing = await open(destination, 'r');
      await existing.close();
      profile = await readProfile(destination);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      profile = { purpose: 'simulator', version: 1, nodeUrl: url.href, caFile, pcs: [] };
    }
    if (
      profile.nodeUrl !== url.href ||
      profile.caFile !== caFile ||
      profile.pcs.some((p) => p.number === options.number)
    )
      throw failure();
    // Comprobar permiso de escritura antes de consumir el código. Sin directorios implícitos.
    file = await open(temporary, 'wx', 0o600);
    const result = pcRegistrationResponseSchema.parse(
      await postRegistration(
        new URL('/pcs/register', url),
        ca,
        JSON.stringify({ installationCode, macAddress }),
      ),
    );
    const identity = { number: options.number, pc: result.pc, credential: result.credential };
    const next = profileSchema.parse({ ...profile, pcs: [...profile.pcs, identity] });
    if (new Set(next.pcs.map((p) => p.pc.id)).size !== next.pcs.length) throw failure();
    await file.writeFile(JSON.stringify(next, null, 2) + '\n');
    await file.sync();
    await file.close();
    file = undefined;
    await rename(temporary, destination);
    return identity;
  } catch {
    throw failure();
  } finally {
    await file?.close();
    await rm(temporary, { force: true });
    if (lock) {
      await lock.close();
      await rm(lockPath, { force: true });
    }
  }
}

export function simulatorIdentity(profile: SimulatorProfile, number: number): SimulatorIdentity {
  const identity = profile.pcs.find((p) => p.number === number);
  if (!identity)
    throw new SimulatorConfigError(
      'La PC solicitada no está registrada en el perfil de simulación.',
    );
  return identity;
}

/** La URL no transporta secretos. ws permite cabeceras/CA y aplica los límites del protocolo. */
export function simulatorConnector(
  profile: SimulatorProfile,
  identity: SimulatorIdentity,
  ca: Buffer | undefined,
): () => WebSocket {
  const url = nodeUrl(profile.nodeUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/pc';
  return () =>
    new WebSocket(url, {
      ca,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      maxPayload: 16_384,
      handshakeTimeout: 10_000,
      headers: { Authorization: `Bearer ${identity.credential}` },
    });
}
