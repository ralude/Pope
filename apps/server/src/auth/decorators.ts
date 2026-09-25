import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { StaffProfile, StaffRole } from '@pope/shared';
import type { FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Miembro del personal autenticado; lo pone `StaffAuthGuard`. */
    staff?: StaffProfile;
  }
}

export const IS_PUBLIC = 'pope:isPublic';
export const ROLES = 'pope:roles';

/** El endpoint no exige sesión del personal (p. ej. `/health` o el propio login). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Solo los roles indicados pueden usar el endpoint (plan 001, "Seguridad"): el encargado
 * opera, el administrador además configura y el dueño solo lee. Sin este decorador basta
 * con tener sesión.
 */
export const Roles = (...roles: StaffRole[]) => SetMetadata(ROLES, roles);

/** Inyecta en el controlador el miembro del personal autenticado. */
export const CurrentStaff = createParamDecorator(
  (_data: unknown, context: ExecutionContext): StaffProfile | undefined =>
    context.switchToHttp().getRequest<FastifyRequest>().staff,
);
