// Mide cuánto tarda argon2id con los parámetros de Pope en esta máquina (T11, REQ-001-50).
// Hay que ejecutarlo en el PC servidor del local (i3-2120, 8 GB, sin AVX2; ADR-0016):
//   pnpm --filter @pope/server build && pnpm --filter @pope/server bench:argon2
// Se compila antes porque importa los parámetros desde dist.
import console from 'node:console';
import { cpus, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import process from 'node:process';

import { hash, verify } from '@node-rs/argon2';

import { ARGON2_OPTIONS } from '../dist/auth/password-params.js';

const RUNS = 20;

const timings = [];
let hashed = '';
for (let i = 0; i < RUNS; i++) {
  const start = performance.now();
  hashed = await hash(`contraseña-de-prueba-${String(i)}`, ARGON2_OPTIONS);
  timings.push(performance.now() - start);
}
const verifyStart = performance.now();
await verify(hashed, `contraseña-de-prueba-${String(RUNS - 1)}`);
const verifyMs = performance.now() - verifyStart;

// Hasta 40 logins a la vez (REQ-001-50): tiempo total y memoria del proceso.
const concurrentStart = performance.now();
await Promise.all(Array.from({ length: 40 }, (_, i) => hash(`c-${String(i)}`, ARGON2_OPTIONS)));
const concurrentMs = performance.now() - concurrentStart;

timings.sort((a, b) => a - b);
const avg = timings.reduce((sum, t) => sum + t, 0) / timings.length;
const p95 = timings[Math.ceil(timings.length * 0.95) - 1];
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;

console.log(`CPU: ${cpus()[0]?.model ?? 'desconocida'} (${String(cpus().length)} hilos)`);
console.log(`RAM total: ${mb(totalmem())} · Node ${process.version}`);
console.log(
  `Parámetros: m=${String(ARGON2_OPTIONS.memoryCost)} KiB, t=${String(ARGON2_OPTIONS.timeCost)}, p=${String(ARGON2_OPTIONS.parallelism)}`,
);
console.log(`hash (${String(RUNS)} veces): media ${avg.toFixed(0)} ms · p95 ${p95.toFixed(0)} ms`);
console.log(`verify: ${verifyMs.toFixed(0)} ms`);
console.log(`40 hashes a la vez: ${concurrentMs.toFixed(0)} ms en total`);
console.log(`Memoria del proceso (RSS): ${mb(process.memoryUsage().rss)}`);
