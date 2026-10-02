import {
  applyDecorators,
  type CanActivate,
  ConflictException,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { CashShift } from '@pope/shared';
import type { FastifyRequest } from 'fastify';

import { ShiftsService } from './shifts.service.js';

/** Respuesta cuando una operación de caja no tiene turno abierto. */
export const NO_OPEN_SHIFT_MESSAGE = 'Abre un turno de caja para continuar';

declare module 'fastify' {
  interface FastifyRequest {
    /** Caja abierta del local; la pone `OpenShiftGuard`. */
    shift?: CashShift;
  }
}

/**
 * Rechaza la petición si no hay una caja abierta en el local (REQ-001-03, REQ-001-60,
 * REQ-005-44). Va por `@UseGuards`, así que corre después del guard global de sesión, que
 * ya dejó al miembro del personal en la petición.
 */
@Injectable()
export class OpenShiftGuard implements CanActivate {
  constructor(private readonly shifts: ShiftsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (!request.staff) {
      throw new UnauthorizedException('Inicia sesión para continuar');
    }
    const shift = await this.shifts.findOpen();
    if (!shift) {
      throw new ConflictException(NO_OPEN_SHIFT_MESSAGE);
    }
    request.shift = shift;
    return true;
  }
}

/** El endpoint exige un turno de caja abierto (p. ej. recargas y cobros en caja). */
export const RequiresOpenShift = () => applyDecorators(UseGuards(OpenShiftGuard));

/** Inyecta el turno abierto en un endpoint marcado con `@RequiresOpenShift()`. */
export const CurrentShift = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CashShift | undefined =>
    context.switchToHttp().getRequest<FastifyRequest>().shift,
);
