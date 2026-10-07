// Escribe el JSON Schema del protocolo PC ↔ nodo en dist/json-schema/ para el agente en C#
// (spec 003, ADR-0002). Se ejecuta tras compilar, así que importa desde dist.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';

import { pcProtocolJsonSchemas } from '../dist/index.js';
import { protocolJsonArtifacts, serializeProtocolArtifact } from '../dist/protocol-export.js';

const outDir = join(import.meta.dirname, '..', 'dist', 'json-schema');
const baselineDir = join(import.meta.dirname, '..', 'protocol');
const update = process.argv.length === 3 && process.argv[2] === '--update';
if (process.argv.length > 2 && !update) throw new Error('Uso: export-json-schema.mjs [--update]');
mkdirSync(outDir, { recursive: true });

// Conservar las dos rutas provisionales v1 hasta cambiar la admisión en T13.
for (const [name, schema] of Object.entries(pcProtocolJsonSchemas())) {
  writeFileSync(join(outDir, `${name}.schema.json`), serializeProtocolArtifact(schema));
}
for (const [name, artifact] of Object.entries(protocolJsonArtifacts())) {
  const serialized = serializeProtocolArtifact(artifact);
  const baseline = join(baselineDir, name);
  if (update) {
    mkdirSync(dirname(baseline), { recursive: true });
    writeFileSync(baseline, serialized);
  } else if (readFileSync(baseline, 'utf8') !== serialized) {
    throw new Error(`Contrato cambiado: ${name}. Revisar compatibilidad antes de protocol:update.`);
  }
  const output = join(outDir, name);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, serialized);
}
