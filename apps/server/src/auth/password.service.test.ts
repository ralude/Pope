import { describe, expect, it } from 'vitest';

import { PasswordService } from './password.service.js';

const service = new PasswordService();

describe('PasswordService (REQ-001-51)', () => {
  it('usa argon2id con m=19 MiB, t=2, p=1', async () => {
    const hashed = await service.hash('secreto');
    expect(hashed).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('el hash no contiene la contraseña', async () => {
    const hashed = await service.hash('secreto123');
    expect(hashed).not.toContain('secreto123');
  });

  it('usa una sal distinta en cada hash', async () => {
    expect(await service.hash('secreto')).not.toBe(await service.hash('secreto'));
  });

  it('verifica la contraseña correcta y rechaza la incorrecta', async () => {
    const hashed = await service.hash('secreto');
    expect(await service.verify(hashed, 'secreto')).toBe(true);
    expect(await service.verify(hashed, 'Secreto')).toBe(false);
    expect(await service.verify(hashed, '')).toBe(false);
  });

  it('admite contraseñas con tildes y ñ', async () => {
    const hashed = await service.hash('contraseña-Ñandú');
    expect(await service.verify(hashed, 'contraseña-Ñandú')).toBe(true);
  });

  it('un hash corrupto cuenta como contraseña incorrecta, sin lanzar errores', async () => {
    expect(await service.verify('no-es-un-hash', 'secreto')).toBe(false);
    expect(await service.verify('', 'secreto')).toBe(false);
  });
});
