// Prueba de carga (T37, REQ-001-50, ADR-0011): 40 PCs simuladas contra el servidor local.
import { readFile, stat } from 'node:fs/promises';

import { SIM_PASSWORD, simUsername } from './args.js';
import { type LoadResult, summarize, summarizeMemory } from './load-report.js';
import { SimulatedPc } from './simulated-pc.js';

export interface LoadOptions {
  url: string;
  pcs: number[];
  /** Espera entre los logins de la fase 1: uno cada 1,5 s, como llegan los clientes. */
  staggerMs: number;
  /** Segundos que se mantienen las sesiones, con latidos, tras el último login. */
  holdSeconds: number;
  /** Archivo donde el servidor escribe su log (con `POPE_MEMORY_LOG_MS`), para medir la memoria. */
  serverLog?: string;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitUntil(condition: () => boolean, timeoutMs: number): Promise<boolean> {
  const limit = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > limit) {
      return false;
    }
    await sleep(50);
  }
  return true;
}

/** Tamaño actual del log del servidor: lo escrito desde ahí es lo que pasó durante la prueba. */
async function logOffset(path: string | undefined): Promise<number> {
  return path ? (await stat(path)).size : 0;
}

export async function runLoad(
  options: LoadOptions,
  log: (line: string) => void,
): Promise<LoadResult> {
  const errors: string[] = [];
  const pcs = options.pcs.map((n) => new SimulatedPc({ number: n, url: options.url }));
  const startOffset = await logOffset(options.serverLog);

  const timedLogin = async (pc: SimulatedPc, phase: 1 | 2): Promise<number | null> => {
    try {
      const result = await pc.login(simUsername(pc.number), SIM_PASSWORD);
      if (!result.ok) {
        errors.push(`fase ${String(phase)} · ${pc.name}: el nodo rechazó el login`);
        return null;
      }
      return result.ms;
    } catch (error) {
      errors.push(`fase ${String(phase)} · ${pc.name}: ${(error as Error).message}`);
      return null;
    }
  };
  const logoutAll = async () => {
    for (const pc of pcs) {
      if (pc.snapshot().sessionId !== null) {
        pc.logout();
      }
    }
    await waitUntil(() => pcs.every((pc) => pc.snapshot().sessionId === null), 15_000);
  };

  try {
    for (const pc of pcs) {
      pc.start();
    }
    if (!(await waitUntil(() => pcs.every((pc) => pc.snapshot().connected), 30_000))) {
      throw new Error('No todas las PCs pudieron conectar con el servidor en 30 s');
    }
    log(
      `${String(pcs.length)} PCs conectadas. Fase 1: un login cada ${String(options.staggerMs)} ms.`,
    );

    // Fase 1, la que decide: logins escalonados y sesiones mantenidas con latidos.
    const staggeredPromises = pcs.map(async (pc, i) => {
      await sleep(i * options.staggerMs);
      return timedLogin(pc, 1);
    });
    const staggered = (await Promise.all(staggeredPromises)).filter((v): v is number => v !== null);
    log(
      `Fase 1: ${String(staggered.length)} logins hechos. Sesiones mantenidas ${String(options.holdSeconds)} s…`,
    );
    await sleep(options.holdSeconds * 1000);
    const holdOffset = await logOffset(options.serverLog);

    // Fase 2, informativa: todos a la vez.
    await logoutAll();
    log('Fase 2: ráfaga de logins a la vez…');
    const burst = (await Promise.all(pcs.map((pc) => timedLogin(pc, 2)))).filter(
      (v): v is number => v !== null,
    );
    await sleep(2000);
    await logoutAll();

    let memory: LoadResult['memory'] = null;
    if (options.serverLog) {
      await sleep(6000); // Deja que el servidor registre una última línea.
      const text = await readFile(options.serverLog, 'utf8');
      const bytes = Buffer.from(text, 'utf8');
      const slice = (from: number, to?: number) => bytes.subarray(from, to).toString('utf8');
      memory = summarizeMemory({
        wholeLog: text,
        duringTest: slice(startOffset),
        duringHold: slice(startOffset, holdOffset),
      });
    }
    return {
      pcs: pcs.length,
      staggerMs: options.staggerMs,
      holdSeconds: options.holdSeconds,
      staggered: summarize(staggered),
      burst: summarize(burst),
      errors,
      memory,
    };
  } finally {
    for (const pc of pcs) {
      pc.stop();
    }
  }
}
