import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

import { ARGON2_OPTIONS } from './password-params.js';

/**
 * Hash y verificación de contraseñas de clientes y personal con argon2id (REQ-001-51).
 * Las contraseñas nunca se registran ni se incluyen en errores.
 */
@Injectable()
export class PasswordService {
  /** Devuelve el hash en formato PHC (`$argon2id$v=19$m=19456,t=2,p=1$…`). */
  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  /**
   * Comprueba una contraseña contra su hash. Un hash corrupto o con otro formato cuenta
   * como contraseña incorrecta: nunca lanza un error con datos de la contraseña.
   */
  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}
