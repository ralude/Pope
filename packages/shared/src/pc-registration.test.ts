import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  NATIVE_PC_PROTOCOL_VERSION,
  PC_INSTALLATION_CODE_TTL_SECONDS,
  normalizePcMacAddress,
  pcAuthenticationErrorSchema,
  pcAuthorizationHeaderSchema,
  pcCredentialSchema,
  pcInstallationCodeRequestSchema,
  pcInstallationCodeResponseSchema,
  pcInstallationCodeSchema,
  pcMacAddressInputSchema,
  pcMacAddressSchema,
  pcRegistrationErrorSchema,
  pcRegistrationRequestSchema,
  pcRegistrationResponseSchema,
  registeredPcSchema,
} from './pc-registration.js';
import { pcToNodeMessageSchema, PROTOCOL_VERSION } from './protocol.js';

const ID = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
// Datos sintéticos, nunca credenciales de un nodo.
const CODE = 'A'.repeat(22);
const CREDENTIAL = 'A'.repeat(43);
const PC = { id: ID, name: 'PC 01', macAddress: 'AA:BB:CC:DD:EE:FF' };

describe('registro de PCs', () => {
  it('REQ-003-10: acepta código y credencial canónicos sin confundirlos', () => {
    expect(pcInstallationCodeSchema.safeParse(CODE).success).toBe(true);
    expect(pcCredentialSchema.safeParse(CREDENTIAL).success).toBe(true);
    for (const invalid of [CODE.slice(1), `${CODE}=`, `${CODE.slice(0, -1)}B`, CREDENTIAL]) {
      expect(pcInstallationCodeSchema.safeParse(invalid).success).toBe(false);
    }
    for (const invalid of [CODE, CREDENTIAL.slice(1), `${CREDENTIAL}=`, 'A'.repeat(42) + 'B']) {
      expect(pcCredentialSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it('REQ-003-10: distingue alta nueva de recuperación de la misma PC', () => {
    expect(pcInstallationCodeRequestSchema.parse({})).toEqual({});
    expect(pcInstallationCodeRequestSchema.parse({ pcId: ID })).toEqual({ pcId: ID });
    for (const invalid of [{ pcId: 'PC 01' }, { pcId: null }, { role: 'administrador' }]) {
      expect(pcInstallationCodeRequestSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it('REQ-003-10: expiración UTC y plazo de 600 segundos, sin aceptar offsets', () => {
    const issued = { id: ID, code: CODE, expiresAt: '2026-10-04T20:10:00Z' };
    expect(PC_INSTALLATION_CODE_TTL_SECONDS).toBe(600);
    expect(pcInstallationCodeResponseSchema.parse(issued)).toEqual(issued);
    for (const expiresAt of ['2026-10-04T16:10:00-04:00', '2026-10-04', 'ayer']) {
      expect(pcInstallationCodeResponseSchema.safeParse({ ...issued, expiresAt }).success).toBe(
        false,
      );
    }
  });

  it('REQ-003-10: el instalador no impone identidad, nombre, rol ni estado', () => {
    const request = { installationCode: CODE, macAddress: 'aa-bb-cc-dd-ee-ff' };
    expect(pcRegistrationRequestSchema.parse(request)).toEqual(request);
    for (const extra of [{ pcId: ID }, { name: 'PC falsa' }, { role: 'dueno' }, { active: true }]) {
      expect(pcRegistrationRequestSchema.safeParse({ ...request, ...extra }).success).toBe(false);
    }
  });

  it('REQ-003-22: normaliza MAC unicast y rechaza nula, multicast y formato ambiguo', () => {
    expect(normalizePcMacAddress('aa-bb-cc-dd-ee-ff')).toBe(PC.macAddress);
    expect(normalizePcMacAddress('aA:bB:cC:dD:eE:fF')).toBe(PC.macAddress);
    expect(pcMacAddressSchema.safeParse('aa:bb:cc:dd:ee:ff').success).toBe(false);
    for (const invalid of [
      '00:00:00:00:00:00',
      '00-00-00-00-00-00',
      '01:00:5E:00:00:01',
      'FF:FF:FF:FF:FF:FF',
      'AA:BB-CC:DD:EE:FF',
      'AABBCCDDEEFF',
      'AA:BB:CC:DD:EE',
    ]) {
      expect(pcMacAddressInputSchema.safeParse(invalid).success).toBe(false);
      expect(() => normalizePcMacAddress(invalid)).toThrow();
    }
  });

  it('REQ-003-63: solo el registro devuelve la credencial, nunca la ficha ordinaria', () => {
    const response = { pc: PC, credential: CREDENTIAL, protocolVersion: 2 };
    expect(pcRegistrationResponseSchema.parse(response)).toEqual(response);
    expect(registeredPcSchema.parse(PC)).toEqual(PC);
    for (const extra of [
      { credential: CREDENTIAL },
      { secretHash: 'a'.repeat(64) },
      { code: CODE },
    ]) {
      expect(registeredPcSchema.safeParse({ ...PC, ...extra }).success).toBe(false);
      expect(
        pcRegistrationResponseSchema.safeParse({ ...response, pc: { ...PC, ...extra } }).success,
      ).toBe(false);
    }
    expect(
      pcRegistrationResponseSchema.safeParse({ ...response, protocolVersion: 1 }).success,
    ).toBe(false);
  });

  it('REQ-003-63: cabecera Bearer sin URL, espacios extra ni inyección de cabeceras', () => {
    expect(pcAuthorizationHeaderSchema.safeParse(`Bearer ${CREDENTIAL}`).success).toBe(true);
    for (const invalid of [CREDENTIAL, `Bearer  ${CREDENTIAL}`, `Bearer ${CREDENTIAL}\r\nX: 1`]) {
      expect(pcAuthorizationHeaderSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it('REQ-003-11: errores estrictos distinguen registro y revocación autenticada', () => {
    const registration = { code: 'installation_code_used', message: 'El código ya fue usado' };
    const authentication = { code: 'pc_credential_revoked', message: 'Credencial revocada' };
    expect(pcRegistrationErrorSchema.parse(registration)).toEqual(registration);
    expect(pcAuthenticationErrorSchema.parse(authentication)).toEqual(authentication);
    expect(pcAuthenticationErrorSchema.safeParse(registration).success).toBe(false);
    expect(pcRegistrationErrorSchema.safeParse(authentication).success).toBe(false);
    expect(
      pcAuthenticationErrorSchema.safeParse({ ...authentication, credential: CREDENTIAL }).success,
    ).toBe(false);
  });

  it('REQ-003-63: prepara v2 sin romper el canal v1 antes de T13', () => {
    expect(NATIVE_PC_PROTOCOL_VERSION).toBe(2);
    expect(PROTOCOL_VERSION).toBe(1);
    expect(
      pcToNodeMessageSchema.safeParse({
        type: 'hello',
        protocolVersion: 1,
        pcId: ID,
        sessionId: null,
      }).success,
    ).toBe(true);
  });

  it('REQ-003-63: contratos exportables como JSON Schema sin normalizaciones ocultas', () => {
    for (const schema of [pcRegistrationRequestSchema, pcRegistrationResponseSchema]) {
      const json = z.toJSONSchema(schema);
      expect(json.additionalProperties).toBe(false);
      expect(json.type).toBe('object');
    }
  });
});
