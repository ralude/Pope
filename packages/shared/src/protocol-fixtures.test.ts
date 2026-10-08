import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { fullFormats } from 'ajv-formats/dist/formats.js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { normalizeProtocolInput, protocolContractSchemas } from './protocol-export.js';

const fixtures = z
  .array(
    z.object({
      id: z.string(),
      version: z.enum(['v1', 'v2']),
      contract: z.string(),
      valid: z.boolean(),
      input: z.unknown(),
      normalizedUsername: z.string().optional(),
    }),
  )
  .parse(JSON.parse(readFileSync(new URL('../protocol/fixtures.json', import.meta.url), 'utf8')));
const ajv = new Ajv2020({ formats: fullFormats, strict: true });
const contracts = Object.entries(protocolContractSchemas).flatMap(([version, schemas]) => {
  const exported = z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .parse(
      JSON.parse(
        readFileSync(new URL(`../protocol/${version}/schemas.json`, import.meta.url), 'utf8'),
      ),
    );
  return Object.entries<z.ZodType>(schemas).map(([contract, schema]) => {
    const json = exported[contract];
    if (json === undefined) throw new Error(`Falta contrato ${contract}`);
    return { version, contract, schema, validate: ajv.compile(json) };
  });
});

describe('fixtures compartidos con C#', () => {
  it('REQ-003-63: cada contrato tiene ejemplos válidos e inválidos identificables', () => {
    expect(new Set(fixtures.map((fixture) => fixture.id)).size).toBe(fixtures.length);
    for (const { version, contract } of contracts) {
      const cases = fixtures.filter(
        (fixture) => fixture.version === version && fixture.contract === contract,
      );
      expect(
        cases.some((fixture) => fixture.valid),
        `${version}/${contract}`,
      ).toBe(true);
      expect(
        cases.some((fixture) => !fixture.valid),
        `${version}/${contract}`,
      ).toBe(true);
    }
  });

  it.each(fixtures)('REQ-003-63: $id → $valid en Zod y JSON Schema exportado', (fixture) => {
    const contract = contracts.find(
      (candidate) =>
        candidate.version === fixture.version && candidate.contract === fixture.contract,
    );
    if (contract === undefined) throw new Error(`Contrato desconocido: ${fixture.id}`);
    const original = structuredClone(fixture.input);
    const normalized = normalizeProtocolInput(fixture.contract, fixture.input);
    const parsed = contract.schema.safeParse(fixture.input);
    expect(parsed.success).toBe(fixture.valid);
    expect(contract.validate(normalized), JSON.stringify(contract.validate.errors)).toBe(
      fixture.valid,
    );
    if (fixture.normalizedUsername !== undefined) {
      expect(normalized).toHaveProperty('username', fixture.normalizedUsername);
      expect(parsed.success && parsed.data).toHaveProperty('username', fixture.normalizedUsername);
    }
    if (original !== null && typeof original === 'object' && 'password' in original)
      expect(normalized).toHaveProperty('password', original.password);
    expect(fixture.input).toEqual(original);
  });
});
