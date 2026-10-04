// Órdenes de la consola interactiva y su ejecución sobre las PCs simuladas.
import { formatDuration, MAX_DEV_PCS } from '@pope/shared';

import type { LoginResult, PcSnapshot } from './simulated-pc.js';

export type Command =
  | { name: 'login'; pc: number; username: string; password: string }
  | { name: 'logout' | 'pausa' | 'reanuda' | 'reinicio' | 'apagon' | 'luz'; pc: number }
  | { name: 'red'; pc: number; seconds: number }
  | { name: 'estado' | 'ayuda' | 'salir' };

export const HELP = `Órdenes:
  login N usuario contraseña   La PC N inicia sesión.
  logout N                     El cliente de la PC N cierra su sesión.
  pausa N                      Pide al nodo pausar la sesión de la PC N.
  reanuda N                    Pide al nodo reanudar la sesión de la PC N.
  red N segundos               Corte de red: conserva la pausa o sigue contando y reconecta.
  reinicio N                   La PC N se reinicia: pierde la sesión y vuelve a conectar.
  apagon N                     Se va la luz de la PC N: deja de latir sin cerrar la conexión.
  luz N                        Vuelve la luz de la PC N: arranca como tras un reinicio.
  estado                       Una línea por PC.
  ayuda                        Esta ayuda.
  salir                        Cierra la consola.`;

/** Lo que la consola entiende, o el motivo por el que no. */
export type Parsed = { ok: true; command: Command } | { ok: false; error: string };

const fail = (error: string): Parsed => ({ ok: false, error });

function pcNumber(text: string | undefined): number | string {
  const n = Number(text);
  return text !== undefined && Number.isInteger(n) && n >= 1 && n <= MAX_DEV_PCS
    ? n
    : `El número de PC debe ser un entero de 1 a ${String(MAX_DEV_PCS)} (recibí "${text ?? ''}")`;
}

/** Interpreta una línea escrita en la consola. Las líneas vacías no son una orden. */
export function parseCommand(line: string): Parsed | null {
  const words = line.trim().split(/\s+/).filter(Boolean);
  const [name, first, second, third] = words;
  if (name === undefined) {
    return null;
  }
  switch (name.toLowerCase()) {
    case 'estado':
    case 'ayuda':
    case 'salir':
      return { ok: true, command: { name: name.toLowerCase() as 'estado' | 'ayuda' | 'salir' } };
    case 'logout':
    case 'pausa':
    case 'reanuda':
    case 'reinicio':
    case 'apagon':
    case 'luz': {
      const pc = pcNumber(first);
      return typeof pc === 'string'
        ? fail(pc)
        : { ok: true, command: { name: name.toLowerCase() as 'logout', pc } };
    }
    case 'red': {
      const pc = pcNumber(first);
      const seconds = Number(second);
      if (typeof pc === 'string') {
        return fail(pc);
      }
      if (!Number.isInteger(seconds) || seconds < 1) {
        return fail('red necesita los segundos del corte: red N segundos (p. ej. red 3 20)');
      }
      return { ok: true, command: { name: 'red', pc, seconds } };
    }
    case 'login': {
      const pc = pcNumber(first);
      if (typeof pc === 'string') {
        return fail(pc);
      }
      if (!second || !third) {
        return fail('login necesita usuario y contraseña: login N usuario contraseña');
      }
      return { ok: true, command: { name: 'login', pc, username: second, password: third } };
    }
    default:
      return fail(`Orden desconocida: "${name}". Escribe "ayuda" para ver las órdenes.`);
  }
}

/** Lo que la consola necesita de una PC; `SimulatedPc` lo cumple y los tests usan una falsa. */
export interface ControlledPc {
  readonly number: number;
  readonly name: string;
  snapshot(): PcSnapshot;
  login(username: string, password: string): Promise<LoginResult>;
  logout(): void;
  pause(): void;
  resume(): void;
  networkCut(seconds: number): void;
  reboot(): void;
  powerCut(): void;
  powerOn(): void;
}

/** Una línea con el estado de una PC. */
export function describeSnapshot(s: PcSnapshot): string {
  if (s.poweredOff) {
    return `${s.name} · sin luz`;
  }
  if (s.pause) {
    const connection = s.connected ? '' : 'desconectada · ';
    const billing = s.pause.billing ? ' · cobrando tras vencer la pausa' : ' · tiempo detenido';
    return `${s.name} · ${connection}en pausa de ${s.who ?? '?'}${billing} · restante local ${restante(s)}`;
  }
  if (!s.connected) {
    return s.sessionId === null
      ? `${s.name} · desconectada`
      : `${s.name} · desconectada, con sesión de ${s.who ?? '?'} (restante local ${restante(s)})`;
  }
  return s.sessionId === null
    ? `${s.name} · bloqueada`
    : `${s.name} · en sesión de ${s.who ?? '?'} · restante local ${restante(s)}`;
}

function restante(s: PcSnapshot): string {
  return s.localRemainingSeconds === null ? '—' : formatDuration(s.localRemainingSeconds as never);
}

/**
 * Ejecuta una orden. Devuelve `false` si es `salir`. Un error de la orden (una PC que no
 * está en la consola, un login sin conexión) se muestra y no cierra la consola.
 */
export async function executeCommand(
  command: Command,
  pcs: ReadonlyMap<number, ControlledPc>,
  log: (line: string) => void,
): Promise<boolean> {
  switch (command.name) {
    case 'salir':
      return false;
    case 'ayuda':
      log(HELP);
      return true;
    case 'estado':
      for (const pc of pcs.values()) {
        log(describeSnapshot(pc.snapshot()));
      }
      return true;
  }
  const pc = pcs.get(command.pc);
  if (!pc) {
    log(
      `La PC ${String(command.pc)} no está en esta consola (PCs: ${[...pcs.keys()].join(', ')}).`,
    );
    return true;
  }
  switch (command.name) {
    case 'login':
      try {
        const result = await pc.login(command.username, command.password);
        if (!result.ok) {
          log(`${pc.name} · el nodo rechazó el login (${String(Math.round(result.ms))} ms)`);
        }
      } catch (error) {
        log(`${pc.name} · login fallido: ${(error as Error).message}`);
      }
      break;
    case 'logout':
      pc.logout();
      break;
    case 'pausa':
      pc.pause();
      break;
    case 'reanuda':
      pc.resume();
      break;
    case 'red':
      pc.networkCut(command.seconds);
      log(`${pc.name} · sin red durante ${String(command.seconds)} s`);
      break;
    case 'reinicio':
      pc.reboot();
      log(`${pc.name} · reiniciada`);
      break;
    case 'apagon':
      pc.powerCut();
      log(`${pc.name} · se fue la luz`);
      break;
    case 'luz':
      pc.powerOn();
      log(`${pc.name} · volvió la luz`);
      break;
  }
  return true;
}
