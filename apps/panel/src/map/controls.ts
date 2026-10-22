// Lógica de los controles de una PC en el panel (spec 003, T41; REQ-003-20, REQ-003-22,
// REQ-003-43), sin React: qué acciones hay según el estado, qué confirmación pide cada una,
// cómo se construye la petición y qué se le dice al encargado de su resultado. Así se puede
// probar sin navegador. El nodo valida todo de nuevo: ocultar un botón no autoriza nada.
import {
  type PcCommandRequest,
  type PcCommandResponse,
  pcCommandResponseSchema,
  type PcControlContext,
  type PcControlSnapshot,
  pcControlSnapshotSchema,
  type PcMapItem,
  type PcWakeResponse,
  pcWakeResponseSchema,
  type StaffRole,
} from '@pope/shared';

import type { ApiClient } from '../api/client.js';
import { liveRemaining } from './model.js';

export type PcAction =
  'wake' | 'lock' | 'message' | 'restart' | 'powerOff' | 'startMaintenance' | 'endMaintenance';

export interface ActionState {
  action: PcAction;
  label: string;
  enabled: boolean;
  /** Por qué no está disponible, para el `title` del botón. */
  reason: string | null;
}

const LABELS: Record<PcAction, string> = {
  wake: 'Encender',
  lock: 'Bloquear',
  message: 'Enviar mensaje',
  restart: 'Reiniciar',
  powerOff: 'Apagar',
  startMaintenance: 'Iniciar como administrador',
  endMaintenance: 'Terminar mantenimiento',
};

/** Qué estado de la PC decide sus acciones. */
type Occupancy = 'offline' | 'free' | 'session' | 'maintenance';

function occupancyOf(item: PcMapItem): Occupancy {
  if (!item.connected) return 'offline';
  if (item.maintenance) return 'maintenance';
  return item.session ? 'session' : 'free';
}

/** Cada acción en cada estado de la PC: `true` o el motivo por el que no se puede. */
function availability(action: PcAction, item: PcMapItem, occupancy: Occupancy): true | string {
  if (action === 'wake') {
    if (occupancy !== 'offline') return 'La PC ya está conectada';
    return item.canWake ? true : 'Sin tarjeta de red registrada';
  }
  if (occupancy === 'offline') return 'La PC no está conectada';
  // Mientras una orden está en curso, solo se admiten mensajes (no reservan la PC).
  if (item.order && action !== 'message') return 'Orden en curso';
  switch (action) {
    case 'lock':
      return occupancy === 'maintenance' ? 'Termina antes el mantenimiento' : true;
    case 'message':
      return occupancy === 'maintenance' ? 'No se admiten mensajes en mantenimiento' : true;
    case 'restart':
    case 'powerOff':
      return true;
    case 'startMaintenance':
      if (occupancy === 'session') return 'Cierra antes la sesión';
      return occupancy === 'maintenance' ? 'Ya está en mantenimiento' : true;
    case 'endMaintenance':
      return occupancy === 'maintenance' ? true : 'No está en mantenimiento';
  }
}

/** Todas las acciones, en orden fijo, con su disponibilidad. El dueño solo mira. */
export function availableActions(item: PcMapItem, role: StaffRole): ActionState[] {
  const occupancy = occupancyOf(item);
  return (Object.keys(LABELS) as PcAction[]).map((action) => {
    const reason = role === 'dueno' ? 'Solo lectura' : availability(action, item, occupancy);
    return {
      action,
      label: LABELS[action],
      enabled: reason === true,
      reason: reason === true ? null : reason,
    };
  });
}

/** Diálogo de confirmación de una acción. */
export interface Confirmation {
  title: string;
  body: string;
  confirm: string;
}

const MINUTE = 60;

/** Quién tiene la sesión de la PC, para el aviso de cierre. */
function whoOf(item: PcMapItem): string {
  return item.session?.who ?? '';
}

/** Lo que se perdería con una sesión temporal: su tiempo restante, que no se devuelve (REQ-001-69). */
function temporaryLoss(item: PcMapItem, now: Date): string {
  const session = item.session;
  if (session?.kind !== 'temporary') return '';
  const minutes = Math.ceil(liveRemaining(session, item.connected, now) / MINUTE);
  return minutes > 0 ? ` Se perderán ${String(minutes)} min de la sesión temporal.` : '';
}

/**
 * La confirmación que pide una acción, o `null` si se hace al pulsar. Bloquear la pide
 * siempre, también con la PC libre (mantenedor, 2026-10-22). Reiniciar y apagar solo con
 * sesión o mantenimiento, que es lo que exige el nodo (REQ-003-20).
 */
export function confirmationFor(action: PcAction, item: PcMapItem, now: Date): Confirmation | null {
  const pc = item.name;
  const occupancy = occupancyOf(item);
  switch (action) {
    case 'lock':
      return {
        title: `Bloquear la ${pc}`,
        body:
          occupancy === 'session'
            ? `Se cerrará la sesión de ${whoOf(item)} y la ${pc} quedará bloqueada.${temporaryLoss(item, now)}`
            : `La ${pc} quedará bloqueada.`,
        confirm: 'Bloquear',
      };
    case 'restart':
    case 'powerOff': {
      const verb = action === 'restart' ? 'reiniciará' : 'apagará';
      const title = `${action === 'restart' ? 'Reiniciar' : 'Apagar'} la ${pc}`;
      const confirm = action === 'restart' ? 'Reiniciar' : 'Apagar';
      if (occupancy === 'session') {
        return {
          title,
          body: `Se cerrará la sesión de ${whoOf(item)} y después se ${verb} la ${pc}.${temporaryLoss(item, now)}`,
          confirm,
        };
      }
      if (occupancy === 'maintenance') {
        const who = item.maintenance?.actorName ?? '';
        return {
          title,
          body: `Se terminará el mantenimiento de ${who} y después se ${verb} la ${pc}.`,
          confirm,
        };
      }
      return null;
    }
    default:
      return null;
  }
}

/** Texto de un código de error del nodo (órdenes y encendido), en español. */
export function commandErrorMessage(code: string | null, fallback: string): string {
  switch (code) {
    case 'unknown_pc':
      return 'La PC no existe.';
    case 'pc_disconnected':
      return 'La PC no está conectada.';
    case 'pc_unavailable':
      return 'La PC tiene otra orden en curso. Espera a que termine.';
    case 'stale_context':
      return 'La PC cambió de estado. Revisa el mapa y vuelve a intentarlo.';
    case 'confirmation_required':
      return 'Falta confirmar la acción.';
    case 'idempotency_conflict':
      return 'Esa orden ya se usó. Vuelve a intentarlo.';
    case 'invalid_command':
      return 'La orden no es válida para esta PC.';
    case 'pc_connected':
      return 'La PC ya está encendida y conectada.';
    case 'mac_unknown':
      return 'La PC no tiene registrada su tarjeta de red.';
    case 'wake_failed':
      return 'No se pudo enviar el paquete de encendido.';
    case 'internal_error':
      return 'Error del servidor. Inténtalo de nuevo.';
    default:
      return fallback;
  }
}

/**
 * La petición al nodo para una acción, con el `expected` que el panel acaba de leer. Reiniciar o
 * apagar con sesión o mantenimiento llevan `confirmed`; el nodo exige que la persona lo haya
 * confirmado. Devuelve `null` si la acción no corresponde a ese contexto.
 */
export function buildRequest(
  action: Exclude<PcAction, 'wake'>,
  context: PcControlContext,
  id: string,
  text = '',
): PcCommandRequest | null {
  switch (action) {
    case 'lock':
      return context.kind === 'maintenance' ? null : { id, kind: 'lock', expected: context };
    case 'message':
      return context.kind === 'maintenance'
        ? null
        : { id, kind: 'showMessage', expected: context, text };
    case 'startMaintenance':
      return context.kind === 'free' ? { id, kind: 'startMaintenance', expected: context } : null;
    case 'endMaintenance':
      return context.kind === 'maintenance'
        ? { id, kind: 'endMaintenance', expected: context }
        : null;
    case 'restart':
    case 'powerOff':
      return context.kind === 'free'
        ? { id, kind: action, expected: context }
        : { id, kind: action, expected: context, confirmed: true };
  }
}

/** Seguimiento de una orden: si ya terminó y qué decirle al encargado. */
export interface Outcome {
  done: boolean;
  ok: boolean;
  text: string;
}

const APPLIED: Record<string, string> = {
  lock: 'PC bloqueada.',
  showMessage: 'Mensaje enviado.',
  startMaintenance: 'Mantenimiento iniciado.',
  endMaintenance: 'Mantenimiento terminado.',
};

/**
 * Resultado de una orden. Reiniciar y apagar terminan en la aceptación de Windows: no se afirma
 * que la PC se haya reiniciado o apagado (REQ-003-20), eso lo dirá el mapa al desconectarse.
 */
export function outcomeOf(response: PcCommandResponse): Outcome {
  const kind = response.command.action.kind;
  const power = kind === 'restart' || kind === 'powerOff';
  switch (response.status) {
    case 'requested':
      return { done: false, ok: true, text: 'Enviada a la PC…' };
    case 'accepted':
      return power
        ? {
            done: true,
            ok: true,
            text: `Windows aceptó ${kind === 'restart' ? 'reiniciar' : 'apagar'} la PC.`,
          }
        : { done: false, ok: true, text: 'La PC la aceptó. Esperando el resultado…' };
    case 'applied':
      return { done: true, ok: true, text: APPLIED[kind] ?? 'Hecho.' };
    case 'failed':
      return {
        done: true,
        ok: false,
        text:
          response.lastResult?.status === 'failed'
            ? response.lastResult.message
            : 'La PC no pudo hacerlo.',
      };
    case 'expired':
      return { done: true, ok: false, text: 'La PC no respondió a tiempo. Vuelve a intentarlo.' };
    case 'cancelled':
      return { done: true, ok: false, text: 'La orden se canceló.' };
  }
}

/** Encendido de una PC en el mapa: «Encendiendo… (m:ss)» y, pasados 2 min, el aviso (REQ-003-22). */
export type WakeStatus = { kind: 'starting'; secondsLeft: number } | { kind: 'overdue' } | null;

export function wakeStatus(item: PcMapItem, now: Date): WakeStatus {
  if (!item.wake) return null;
  const left = Math.ceil((Date.parse(item.wake.deadline) - now.getTime()) / 1000);
  return left > 0 ? { kind: 'starting', secondsLeft: left } : { kind: 'overdue' };
}

/** `1:05` para la cuenta atrás del encendido. */
export function countdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(minutes)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

/** Texto de la baldosa y del detalle durante el encendido; sin diagnosticar avería. */
export function wakeText(status: Exclude<WakeStatus, null>): string {
  return status.kind === 'starting'
    ? `Encendiendo… (${countdown(status.secondsLeft)})`
    : 'No se conectó en 2 min. Puede seguir arrancando o no tener Wake-on-LAN activo.';
}

// ─── Llamadas al nodo ──────────────────────────────────────────────────────────────────────

/** Contexto vigente, conexión y reserva de la PC: el `expected` de la siguiente orden. */
export function getControl(api: ApiClient, pcId: string): Promise<PcControlSnapshot> {
  return api.get(`/pcs/${pcId}/control`, pcControlSnapshotSchema);
}

export function issueCommand(
  api: ApiClient,
  pcId: string,
  request: PcCommandRequest,
): Promise<PcCommandResponse> {
  return api.post(`/pcs/${pcId}/commands`, request, pcCommandResponseSchema);
}

export function getCommand(
  api: ApiClient,
  pcId: string,
  commandId: string,
): Promise<PcCommandResponse> {
  return api.get(`/pcs/${pcId}/commands/${commandId}`, pcCommandResponseSchema);
}

export function wakePc(api: ApiClient, pcId: string, id: string): Promise<PcWakeResponse> {
  return api.post(`/pcs/${pcId}/wake`, { id }, pcWakeResponseSchema);
}
