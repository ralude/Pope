import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { fullFormats } from 'ajv-formats/dist/formats.js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  normalizeProtocolInput,
  protocolContractSchemas,
  protocolJsonArtifacts,
  serializeProtocolArtifact,
  trimProtocolUsername,
  usernameTrimCodePoints,
} from './protocol-export.js';

const ajv = new Ajv2020({ formats: fullFormats, strict: true });
const schemas = protocolJsonArtifacts();

describe('exportación de contratos para C#', () => {
  it('REQ-003-63: compila cada contrato draft 2020-12 con formatos y sin coerción', () => {
    for (const contracts of Object.values(protocolContractSchemas)) {
      for (const schema of Object.values(contracts)) {
        expect(ajv.compile(z.toJSONSchema(schema, { io: 'input' }))).toBeTypeOf('function');
      }
    }
  });

  it('REQ-003-63: artefactos reproducibles y diferencias con el contrato visibles', () => {
    expect(protocolJsonArtifacts()).toEqual(schemas);
    for (const [name, artifact] of Object.entries(schemas)) {
      const versioned = readFileSync(new URL(`../protocol/${name}`, import.meta.url), 'utf8');
      expect(serializeProtocolArtifact(artifact), name).toBe(versioned);
    }
  });

  it('REQ-003-63: conjunto exacto de trim, incluidos espacios que C# trata distinto', () => {
    // Recorrer BMP comprueba omisiones y adiciones al conjunto; no reproduce el algoritmo.
    for (let point = 0; point <= 0xffff; point++) {
      const character = String.fromCodePoint(point);
      expect(trimProtocolUsername(`${character}ana${character}`)).toBe(
        `${character}ana${character}`.trim(),
      );
    }
    expect(usernameTrimCodePoints).toHaveLength(25);
    expect(trimProtocolUsername('\u0085ana\u0085')).toBe('\u0085ana\u0085');
  });

  it('REQ-003-63: normaliza solo el usuario de login antes de validar; password intacta', () => {
    for (const [contract, type] of [
      ['pc-to-node', 'login'],
      ['shell-request', 'technicalLogin'],
    ] as const) {
      const login = {
        type,
        requestId: '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
        username: ` \ufeff${'a'.repeat(64)}\u3000`,
        password: '  contraseña  ',
      };
      const schema = protocolContractSchemas.v2[contract];
      const validate = ajv.compile(z.toJSONSchema(schema, { io: 'input' }));
      const normalized = normalizeProtocolInput(contract, login);
      expect(validate(login)).toBe(false);
      expect(validate(normalized)).toBe(true);
      expect(schema.parse(login)).toEqual(normalized);
      expect(login.username).toHaveLength(67);
      expect(normalizeProtocolInput('shell-notification', login)).toBe(login);
      expect(normalizeProtocolInput(contract, { ...login, username: ' \t' })).toEqual({
        ...login,
        username: '',
      });
      expect(validate(normalizeProtocolInput(contract, { ...login, username: ' \t' }))).toBe(false);
    }
    const state = { type: 'state', username: ' ana ', password: ' p ' };
    expect(normalizeProtocolInput('pc-to-node', state)).toBe(state);
  });
});
