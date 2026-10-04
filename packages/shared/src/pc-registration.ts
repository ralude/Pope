// Registro y autenticación del agente: spec 003, T01 y ADR-0017.
// Los secretos solo aparecen al emitir el código o registrar la PC, nunca en su ficha.
import { z } from 'zod';

import { idSchema, utcInstantSchema } from './session.js';

/** V2 se prepara sin cambiar el canal provisional v1, que se retirará en T13. */
export const NATIVE_PC_PROTOCOL_VERSION = 2;
export const PC_INSTALLATION_CODE_TTL_SECONDS = 600;

// Base64url canónico sin padding: 16 bytes → 22 caracteres y 32 bytes → 43.
// El último carácter restringe los bits de relleno; el RNG seguro corresponde al nodo.
export const pcInstallationCodeSchema = z.string().regex(/^[A-Za-z0-9_-]{21}[AQgw]$/);
export const pcCredentialSchema = z.string().regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/);

/** Cabecera de autenticación; no se pone en hello ni en la URL. */
export const pcAuthorizationHeaderSchema = z
  .string()
  .regex(/^Bearer [A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/);

/** MAC de inventario/Wake-on-LAN: unicast, no nula y en formato canónico. No autentica. */
export const pcMacAddressSchema = z
  .string()
  .regex(/^(?!00(?::00){5}$)[0-9A-F][02468ACE](?::[0-9A-F]{2}){5}$/);

/** Entrada admite minúsculas y guiones, con un único separador para los seis octetos. */
export const pcMacAddressInputSchema = z
  .string()
  .regex(
    /^(?!(?:00[:-]){5}00$)[0-9A-Fa-f][02468aAcCeE](?:(?::[0-9A-Fa-f]{2}){5}|(?:-[0-9A-Fa-f]{2}){5})$/,
  );

/** Normalización explícita; los esquemas JSON de entrada/salida conservan su significado. */
export function normalizePcMacAddress(input: string): string {
  const parsed = pcMacAddressInputSchema.parse(input);
  return pcMacAddressSchema.parse(parsed.toUpperCase().replaceAll('-', ':'));
}

/** POST /pcs/installation-codes: sin pcId crea PC; con pcId recupera una ya existente. */
export const pcInstallationCodeRequestSchema = z.strictObject({ pcId: idSchema.optional() });
export type PcInstallationCodeRequest = z.infer<typeof pcInstallationCodeRequestSchema>;

/** Respuesta excepcional con código: personal autorizado, un uso y 600 s desde emisión. */
export const pcInstallationCodeResponseSchema = z.strictObject({
  id: idSchema,
  code: pcInstallationCodeSchema,
  expiresAt: utcInstantSchema,
});
export type PcInstallationCodeResponse = z.infer<typeof pcInstallationCodeResponseSchema>;

/** Ficha ordinaria: rechaza secretos y hashes aunque se añadan accidentalmente. */
export const registeredPcSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1),
  macAddress: pcMacAddressSchema,
});
export type RegisteredPc = z.infer<typeof registeredPcSchema>;

/** POST /pcs/register: no acepta identidad, nombre, rol ni estado impuesto por el agente. */
export const pcRegistrationRequestSchema = z.strictObject({
  installationCode: pcInstallationCodeSchema,
  macAddress: pcMacAddressInputSchema,
});
export type PcRegistrationRequest = z.infer<typeof pcRegistrationRequestSchema>;

/** Solo esta respuesta entrega la credencial al instalador/servicio. */
export const pcRegistrationResponseSchema = z.strictObject({
  pc: registeredPcSchema,
  credential: pcCredentialSchema,
  protocolVersion: z.literal(NATIVE_PC_PROTOCOL_VERSION),
});
export type PcRegistrationResponse = z.infer<typeof pcRegistrationResponseSchema>;

export const pcRegistrationErrorCodeSchema = z.enum([
  'invalid_installation_code',
  'installation_code_expired',
  'installation_code_used',
  'invalid_registration',
  'unknown_pc',
  'pc_unavailable',
  'internal_error',
]);
export const pcRegistrationErrorSchema = z.strictObject({
  code: pcRegistrationErrorCodeSchema,
  message: z.string().min(1),
});
export type PcRegistrationError = z.infer<typeof pcRegistrationErrorSchema>;

/** Error previo al upgrade; revocación confirmada no equivale a un fallo de TLS. */
export const pcAuthenticationErrorCodeSchema = z.enum([
  'missing_pc_credential',
  'invalid_pc_credential',
  'pc_credential_revoked',
  'pc_identity_mismatch',
  'unsupported_protocol_version',
]);
export const pcAuthenticationErrorSchema = z.strictObject({
  code: pcAuthenticationErrorCodeSchema,
  message: z.string().min(1),
});
export type PcAuthenticationError = z.infer<typeof pcAuthenticationErrorSchema>;
