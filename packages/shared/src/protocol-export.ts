// Exportación de contratos para C#, sin efectos nativos ni reglas de cobro (REQ-003-63).
import { z } from 'zod';
import * as background from './lock-background.js';
import * as native from './native-protocol.js';
import * as control from './pc-control.js';
import * as registration from './pc-registration.js';
import * as legacy from './protocol.js';

export const protocolContractSchemas = {
  v1: {
    'pc-to-node': legacy.pcToNodeMessageSchema,
    'node-to-pc': legacy.nodeToPcMessageSchema,
  },
  v2: {
    'pc-to-node': native.nativePcToNodeMessageSchema,
    'node-to-pc': native.nativeNodeToPcMessageSchema,
    'shell-request': native.nativeShellRequestSchema,
    'shell-notification': native.nativeShellNotificationSchema,
    'installation-code-request': registration.pcInstallationCodeRequestSchema,
    'installation-code-response': registration.pcInstallationCodeResponseSchema,
    'registration-request': registration.pcRegistrationRequestSchema,
    'registration-response': registration.pcRegistrationResponseSchema,
    'registration-error': registration.pcRegistrationErrorSchema,
    'authentication-error': registration.pcAuthenticationErrorSchema,
    'authorization-header': registration.pcAuthorizationHeaderSchema,
    'registered-pc': registration.registeredPcSchema,
    'command-request': control.pcCommandRequestSchema,
    'command-response': control.pcCommandResponseSchema,
    'command-error': control.pcCommandErrorSchema,
    'background-snapshot': background.lockBackgroundSnapshotSchema,
    'background-error': background.lockBackgroundErrorSchema,
  },
} as const;

// WhiteSpace + LineTerminator de ECMAScript: todos son caracteres BMP.
export const usernameTrimCodePoints = [
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x00a0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003,
  0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
  0xfeff,
] as const;
const trimCharacters = new Set(usernameTrimCodePoints.map((point) => String.fromCodePoint(point)));

/** Referencia para C#: recortar solo extremos con el conjunto exportado. */
export function trimProtocolUsername(username: string): string {
  let start = 0;
  let end = username.length;
  while (start < end && trimCharacters.has(username.charAt(start))) start++;
  while (end > start && trimCharacters.has(username.charAt(end - 1))) end--;
  return username.slice(start, end);
}

/** Aplicar antes de JSON Schema; Zod ya hace este recorte en los contratos originales. */
export function normalizeProtocolInput(contract: string, input: unknown): unknown {
  if (!['pc-to-node', 'shell-request'].includes(contract)) return input;
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return input;
  const value = input as Record<string, unknown>;
  if (
    typeof value.type !== 'string' ||
    !['login', 'technicalLogin'].includes(value.type) ||
    typeof value.username !== 'string'
  )
    return input;
  return { ...value, username: trimProtocolUsername(value.username) };
}

export function protocolJsonArtifacts(): Record<string, unknown> {
  const artifacts: Record<string, unknown> = {};
  for (const [version, contracts] of Object.entries(protocolContractSchemas)) {
    artifacts[`${version}/schemas.json`] = Object.fromEntries(
      Object.entries(contracts).map(([name, schema]) => [
        name,
        z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' }),
      ]),
    );
  }
  artifacts['normalization.json'] = {
    versions: [legacy.PROTOCOL_VERSION, registration.NATIVE_PC_PROTOCOL_VERSION],
    contracts: ['pc-to-node', 'shell-request'],
    messageTypes: ['login', 'technicalLogin'],
    field: 'username',
    operation: 'trim-edges-before-validation',
    codePoints: usernameTrimCodePoints,
    passwordOperation: 'none',
    instructions: [
      'Antes de validar JSON Schema, recortar solo username en los mensajes y contratos indicados.',
      'C#: construir char[] con codePoints y aplicar username.Trim(chars); no usar Trim() sin argumentos.',
      'Conservar espacios interiores, mayúsculas y Unicode; no normalizar ninguna otra cadena.',
      'No recortar ni modificar password, aunque esté formada solo por espacios.',
      'JSON Schema mide longitud en puntos de código Unicode; no sustituirla por string.Length de C#.',
    ],
  };
  return artifacts;
}

export function serializeProtocolArtifact(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
