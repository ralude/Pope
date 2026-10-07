# Contratos del cliente Windows · REQ-003-63

Generados desde Zod; no editar los JSON a mano. `pnpm --filter @pope/shared build`
comprueba el contrato versionado y lo copia a `dist/json-schema/`. Cada clave de
`v1/schemas.json` o `v2/schemas.json` contiene un JSON Schema draft 2020-12 independiente.
V1 es provisional hasta T13; v2 separa agente/nodo y puente React. Las dos rutas
anteriores `pc-to-node.schema.json`/`node-to-pc.schema.json` se conservan para v1.

Antes de validar entradas de login, aplicar `normalization.json`: solo usuario,
con su conjunto explícito de recorte; contraseña intacta. Los schemas describen
entradas (`io: input`), incluidos los campos adicionales permitidos por v1. No
desactivar validación de formatos, patrones ni propiedades en el consumidor C#.

Cuando cambie un contrato, revisar su impacto y la versión del canal antes de ejecutar
`pnpm --filter @pope/shared protocol:update`; los tests/build fallan ante diferencias.
El guard detecta cambios, no decide automáticamente si son compatibles. T08 comprobará
estos mismos casos en C#; los tests TypeScript todavía no prueban el consumidor nativo.

`fixtures.json` contiene casos sintéticos con `id`, `version`, `contract`, `input` y
`valid` esperado, fijado explícitamente. El consumidor debe resolver el schema por versión
y contrato, normalizar el usuario y comprobar el resultado sin coerción. Los tests leen
estos JSON exportados y comparan los resultados con Zod. No contienen secretos reales.

Referencias: [exportación Zod](https://zod.dev/json-schema),
[Ajv draft 2020-12](https://ajv.js.org/json-schema.html),
[recorte ECMAScript](https://tc39.es/ecma262/multipage/text-processing.html#sec-string.prototype.trim).
