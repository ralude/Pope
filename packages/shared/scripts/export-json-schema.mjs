// Escribe el JSON Schema del protocolo PC ↔ nodo en dist/json-schema/ para el agente en C#
// (spec 003, ADR-0002). Se ejecuta tras compilar, así que importa desde dist.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { pcProtocolJsonSchemas } from '../dist/index.js';

const outDir = join(import.meta.dirname, '..', 'dist', 'json-schema');
mkdirSync(outDir, { recursive: true });

for (const [name, schema] of Object.entries(pcProtocolJsonSchemas())) {
  writeFileSync(join(outDir, `${name}.schema.json`), `${JSON.stringify(schema, null, 2)}\n`);
}
