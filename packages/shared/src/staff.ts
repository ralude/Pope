// Personal del local y su acceso al panel (REQ-001-40).
import { z } from 'zod';

import { idSchema } from './session.js';

/**
 * Roles del personal: el encargado opera; el administrador además configura tarifas,
 * combos y personal; el dueño solo consulta (plan 001, "Seguridad").
 */
export const staffRoleSchema = z.enum(['encargado', 'administrador', 'dueno']);
export type StaffRole = z.infer<typeof staffRoleSchema>;

/**
 * Usuario del personal: se guarda tal cual lo escriben, pero es único sin distinguir
 * mayúsculas (igual que el de los clientes, REQ-001-02).
 */
export const staffUsernameSchema = z.string().trim().min(1).max(64);

/** Nombre que se muestra en el panel y en los eventos ("Ana"). */
export const staffDisplayNameSchema = z.string().trim().min(1).max(100);

/**
 * Contraseña del personal: basta con que no esté vacía (pregunta resuelta de la spec 001).
 * El límite superior solo evita calcular argon2 sobre textos enormes.
 */
export const staffPasswordSchema = z.string().min(1).max(256);

/** Cuerpo de `POST /auth/login`. */
export const staffLoginRequestSchema = z.object({
  username: staffUsernameSchema,
  password: staffPasswordSchema,
});
export type StaffLoginRequest = z.infer<typeof staffLoginRequestSchema>;

/** Datos del miembro del personal que ha iniciado sesión. */
export const staffProfileSchema = z.object({
  id: idSchema,
  username: z.string(),
  displayName: z.string(),
  role: staffRoleSchema,
});
export type StaffProfile = z.infer<typeof staffProfileSchema>;
