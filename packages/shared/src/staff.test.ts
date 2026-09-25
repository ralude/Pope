import { describe, expect, it } from 'vitest';

import { staffLoginRequestSchema, staffRoleSchema } from './staff.js';

describe('personal (REQ-001-40)', () => {
  it('tiene los tres roles del plan', () => {
    expect(staffRoleSchema.options).toEqual(['encargado', 'administrador', 'dueno']);
  });

  it('el login recorta el usuario y admite cualquier contraseña no vacía', () => {
    expect(staffLoginRequestSchema.parse({ username: ' Ana ', password: 'a' })).toEqual({
      username: 'Ana',
      password: 'a',
    });
    expect(staffLoginRequestSchema.safeParse({ username: 'ana', password: '' }).success).toBe(
      false,
    );
    expect(staffLoginRequestSchema.safeParse({ username: '  ', password: 'a' }).success).toBe(
      false,
    );
  });
});
