import type { StaffProfile } from '@pope/shared';

import type { StaffService } from '../auth/staff.service.js';

export interface FirstAdminInput {
  username: string;
  displayName: string;
  password: string;
}

/** Ya hay un administrador: el resto del personal se crea desde el panel (T14d). */
export class AdminAlreadyExistsError extends Error {
  constructor() {
    super('Ya existe un administrador activo. Crea el resto del personal desde el panel.');
  }
}

/**
 * Crea el primer administrador del local (REQ-001-40). Solo funciona si no hay ningún
 * administrador activo. El alta emite `staff.created` con actor `system`.
 */
export async function createFirstAdmin(
  staff: StaffService,
  input: FirstAdminInput,
): Promise<StaffProfile> {
  if ((await staff.countActiveAdministrators()) > 0) {
    throw new AdminAlreadyExistsError();
  }
  return staff.create({ ...input, role: 'administrador' }, { kind: 'system' });
}
