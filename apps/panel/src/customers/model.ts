// Lógica de la pantalla de clientes (T40), sin React para poder probarla: cómo se muestra el
// estado de cada cuenta, qué cambios de estado se ofrecen y cómo se pide cada página.
import { type Customer, type CustomerStatus, formatLocalTime } from '@pope/shared';

/** Clientes por página de la lista (el nodo admite hasta 100). */
export const PAGE_SIZE = 50;

/**
 * Lo que se ve en la columna Estado. "Bloqueo por intentos" solo aparece en cuentas activas:
 * en una bloqueada o desactivada manda su estado, que ya le impide entrar.
 */
export type CustomerBadge = CustomerStatus | 'locked';

export const BADGE_LABEL: Record<CustomerBadge, string> = {
  active: 'Activa',
  blocked: 'Bloqueada',
  disabled: 'Desactivada',
  locked: 'Bloqueo por intentos',
};

/** ¿Sigue vigente el bloqueo por intentos fallidos (REQ-001-52)? */
export function isLoginLocked(customer: Customer, now: Date): boolean {
  return customer.loginLockedUntil !== null && new Date(customer.loginLockedUntil) > now;
}

export function customerBadge(customer: Customer, now: Date): CustomerBadge {
  return customer.status === 'active' && isLoginLocked(customer, now) ? 'locked' : customer.status;
}

/** Aviso del bloqueo por intentos, con la hora del local a la que termina. */
export function lockNotice(customer: Customer): string | null {
  if (customer.loginLockedUntil === null) return null;
  const until = formatLocalTime(new Date(customer.loginLockedUntil));
  return `Bloqueada por 5 intentos fallidos hasta las ${until}.`;
}

export interface StatusAction {
  status: CustomerStatus;
  label: string;
}

const ACTION_LABEL: Record<CustomerStatus, string> = {
  active: 'Activar',
  blocked: 'Bloquear',
  disabled: 'Desactivar',
};

/**
 * Cambios de estado que se ofrecen: los otros dos. Se puede pasar de cualquiera a cualquiera
 * y el saldo se conserva (REQ-001-04).
 */
export function statusActions(status: CustomerStatus): StatusAction[] {
  return (['active', 'blocked', 'disabled'] as const)
    .filter((target) => target !== status)
    .map((target) => ({ status: target, label: ACTION_LABEL[target] }));
}

/** Teléfono guardado (`+584121234567`) como se escribe en Venezuela: `0412-1234567`. */
export function formatPhone(phone: string): string {
  const match = /^\+58(\d{3})(\d{7})$/.exec(phone);
  return match ? `0${match[1] ?? ''}-${match[2] ?? ''}` : phone;
}

/** Ruta de `GET /customers` para una búsqueda y una página. */
export function searchPath(q: string, offset: number): string {
  const params = new URLSearchParams();
  const text = q.trim();
  if (text) params.set('q', text);
  params.set('limit', String(PAGE_SIZE));
  params.set('offset', String(offset));
  return `/customers?${params.toString()}`;
}

/** Pone en la lista la versión nueva de un cliente (tras cambiarlo), si está en ella. */
export function replaceCustomer(list: readonly Customer[], updated: Customer): Customer[] {
  return list.map((customer) => (customer.id === updated.id ? updated : customer));
}
