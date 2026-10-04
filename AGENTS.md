# AGENTS.md — Pope

Reglas obligatorias para cualquier agente de IA (y persona) que trabaje en este repositorio.
Si algo aquí choca con una instrucción directa del usuario, manda el usuario. Si una tarea
choca con un ADR **Aceptado**, detente y avisa antes de actuar.

## Lectura obligatoria por defecto: `AGENTS.md` y `ESTADO.md`

En cada chat nuevo, antes de empezar una tarea y al retomar después de una compactación,
lee completos `AGENTS.md` y `ESTADO.md` de la raíz del repositorio, sin esperar a que el
usuario lo pida. Usa los archivos actuales del disco; no dependas de un resumen anterior.
Esta regla también se aplica si trabajas desde una subcarpeta.

[`ESTADO.md`](ESTADO.md) dice en qué spec y en qué tarea va el proyecto, qué está
bloqueado y qué pasó últimamente. **Léelo siempre al empezar**, y **actualízalo en el
mismo commit** en que termines una tarea (siguiente tarea, progreso y bitácora). Si no
lo actualizas, el siguiente agente arrancará desde un punto equivocado.

## Qué es Pope

Sistema de gestión de cibercafés inspirado en SENET. Cada PC arranca directamente en un
Shell bloqueado; el cliente inicia sesión con una cuenta creada en el nodo central; el
tiempo se descuenta del saldo y puede pausarse; el local vende productos con inventario
al día. El dueño vive en **España** y consulta todo desde una web; el local está en
**Venezuela**, con internet y electricidad inestables.

## Arquitectura en 30 segundos

```
PC cliente   Agente (C#, servicio de Windows) + Shell (React en WebView2, host C#)
     │  LAN · WebSocket
Nodo local   NestJS + PostgreSQL        ← fuente de verdad; funciona SIN internet
     │  sincronización por eventos cuando hay red
Nube         NestJS (modo cloud) + PostgreSQL → Web del dueño (solo navegador)
```

Justificación de cada pieza: [`docs/adr/`](docs/adr/README.md).

## Mapa del repositorio (objetivo)

El monorepo (pnpm + Turborepo) ya existe; los paquetes se crean a medida que los pide cada
spec. Esta es la estructura acordada ([ADR-0002](docs/adr/0002-monorepo-typescript.md)):

| Ruta | Contenido | Lenguaje |
|---|---|---|
| `apps/server` | API del nodo local y de la nube (mismo código, dos modos) | TS |
| `apps/panel` | Panel del encargado (local) y web del dueño (nube) | TS/React |
| `apps/shell-ui` | Interfaz que ve el cliente en la PC | TS/React |
| `apps/native` | Agente (servicio) y host del Shell (WebView2) | C# |
| `packages/shared` | Tipos, esquemas `zod`, reglas de negocio compartidas | TS |
| `tools/*` | Herramientas de desarrollo (p. ej. `tools/agent-sim`, simulador de PCs) | TS |
| `docs/adr` | Decisiones de arquitectura | — |
| `docs/specs` | Especificaciones SDD (spec → plan → tasks) | — |

## Reglas no negociables

### 1. Spec-Driven Development (SDD)

- **No se escribe código de producto sin una spec aprobada** en `docs/specs/NNN-nombre/`.
- Flujo: `spec.md` (qué y por qué) → `plan.md` (cómo) → `tasks.md` (pasos) → código.
  Un humano aprueba cada documento (campo `Estado`) antes de pasar al siguiente.
- Implementa **una tarea de `tasks.md` a la vez**. En el mismo commit, márcala `[x]` y
  actualiza `ESTADO.md`.
- Tests y commits citan los IDs de requisito (`REQ-002-04`).
- Si la spec es ambigua o la realidad la contradice: **detente**, añádelo a
  "Preguntas abiertas" de la spec y pregunta. No inventes requisitos.

Proceso completo: [`docs/specs/README.md`](docs/specs/README.md).

### 2. Decisiones → ADR

- Toda decisión cara de revertir (tecnología, protocolo, esquema, seguridad) necesita un
  ADR en `docs/adr/`.
- No contradigas un ADR **Aceptado**: propón uno nuevo que lo reemplace.
- Un ADR **Propuesto** aún no está decidido: confírmalo con el usuario antes de construir
  encima.

### 3. Invariantes de dominio

- **El nodo local es la fuente de verdad** de tiempo, saldo, sesiones y stock. El agente y
  el Shell solo muestran y obedecen; nunca deciden un cobro ([ADR-0007](docs/adr/0007-nodo-local-fuente-de-verdad.md)).
- **Local-first:** login, cobro, pausa y ventas nunca dependen de internet ni de la nube
  ([ADR-0001](docs/adr/0001-arquitectura-local-first.md)).
- **Dinero en micro-unidades enteras** (6 decimales: `1 USD = 1 000 000`) + código de
  moneda ISO 4217. Prohibido `float`/`number` decimal para dinero. El tiempo va en
  segundos enteros. Solo se redondea a céntimos al mostrar, con `formatMoney`
  ([ADR-0015](docs/adr/0015-dinero-en-micro-unidades.md)).
- **Fechas en UTC** en base de datos y eventos. Se muestran en la zona de quien mira
  (`America/Caracas` en el local, la del navegador para el dueño).
- **Todo cambio de estado genera un evento** inmutable con `actor` (cliente, encargado,
  sistema), id UUIDv7 y marca de tiempo. Los eventos son auditoría y sincronización, y
  deben ser idempotentes ([ADR-0008](docs/adr/0008-sincronizacion-por-eventos.md)).
- **El stock solo cambia mediante movimientos** (entrada, venta, ajuste, merma). Nunca se
  edita la cantidad directamente.

### 4. Seguridad del Shell

- El cliente nunca debe llegar a `explorer.exe`, `cmd`, `powershell`, `regedit`, al
  Administrador de tareas ni al sistema de archivos.
- Añadir una app a la lista blanca exige revisar sus **vías de escape** (diálogos de abrir
  archivo, enlaces al navegador, consolas) y documentarlas en la spec
  ([ADR-0010](docs/adr/0010-lista-blanca-y-restauracion.md)).
- Bloqueo y pausa usan un **escritorio Win32 separado**, nunca una ventana "siempre
  encima" ([ADR-0009](docs/adr/0009-escritorio-separado-para-bloqueo-y-pausa.md)).
- Contraseñas con argon2id; jamás en logs. Cada PC se registra con código de instalación.

### 5. Presupuesto de recursos del nodo local

El servidor del local es un **i3-2120 (2 núcleos) con 8 GB de RAM**, casi siempre encendido
([ADR-0016](docs/adr/0016-servidor-del-local-i3-siempre-encendido.md), que mantiene el presupuesto de
[ADR-0011](docs/adr/0011-presupuesto-de-recursos-nodo-local.md)). Nada puede crecer sin límite
con semanas sin reiniciar:

- Sin Docker, Electron ni servicios pesados en el nodo local.
- Techo de Pope: **~1 GB de RAM** en total (PostgreSQL ≤ 512 MB, Node ≤ 384 MB).
- En el nodo local no se compila ni se hace `pnpm install`: recibe artefactos ya construidos.
- Cada dependencia nueva del servidor o del panel se justifica en el plan. El panel debe
  ir fluido en un navegador de ese mismo PC.

### 6. Código nativo (C#) al mínimo

El mantenedor domina TypeScript pero **no C#**:

- En C# solo va lo que Windows exige: servicio, hook de teclado, escritorio separado,
  control de procesos y host WebView2. La lógica de negocio va en TypeScript.
- Cada llamada Win32 / P/Invoke lleva un comentario que explica qué hace y por qué.
- Prefiere la biblioteca estándar de .NET antes que paquetes de terceros.

### 7. Commits seccionados y digeribles

- **Conventional Commits** en español: `tipo(ámbito): descripción en imperativo`.
  Tipos: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`, `perf`.
  Ámbitos: `server`, `panel`, `shell-ui`, `native`, `shared`, `tools`, `adr`, `specs`, `agents`.
- **Un commit = un cambio lógico**, idealmente una tarea de `tasks.md`. Si el mensaje
  necesita un "y", probablemente son dos commits.
- No mezcles refactor, formato y funcionalidad en el mismo commit.
- Cada commit deja el repo compilando y con los tests en verde.
- El cuerpo explica el **porqué** y referencia `Spec: 002 · REQ-002-04` o `ADR-0007`.
- Orientativo: < 400 líneas cambiadas (sin contar lockfiles ni generados). Si es más,
  divídelo.
- Nunca subas secretos, `.env` ni binarios.

## Idioma y estilo

- Documentación, specs, ADRs, commits y textos de interfaz: **español**.
- Identificadores y nombres de archivos de código: **inglés**. Comentarios: español.
- TypeScript con `strict: true`; toda entrada externa se valida con `zod` (`packages/shared`).

## Comandos

Requisitos: **Node 24 LTS** (ver `.nvmrc`) y **pnpm 12** (fijado en `packageManager`;
con `corepack enable` se usa la versión correcta). Todo se lanza desde la raíz y Turborepo
lo reparte entre los paquetes:

| Comando | Qué hace |
|---|---|
| `pnpm install` | Instala las dependencias de todo el monorepo |
| `pnpm build` | Compila todos los paquetes, respetando las dependencias entre ellos |
| `pnpm typecheck` | Comprueba los tipos con TypeScript estricto |
| `pnpm lint` | Comprueba el formato (Prettier) y pasa ESLint en todos los paquetes |
| `pnpm format` | Reformatea todo con Prettier |
| `pnpm test` | Ejecuta los tests |

Para un solo paquete: `pnpm --filter <paquete> <script>` (p. ej. `pnpm --filter @pope/shared test`).

Cada paquete define sus propios scripts `build`, `typecheck`, `lint` (`eslint --max-warnings=0 .`)
y `test`. TypeScript está fijado en 6.0.x porque `typescript-eslint` aún no admite
versiones posteriores. Convenciones de un paquete TS (modelo: `packages/shared`):

- Módulos ESM (`"type": "module"`); los imports relativos llevan extensión `.js`.
- `tsconfig.json`: extiende `tsconfig.base.json`, sin emitir; incluye `src` y los
  `*.config.ts`. Lo usan `typecheck` y ESLint.
- `tsconfig.build.json`: compila solo `src` a `dist`, sin los tests.
- Tests con Vitest junto al código: `src/**/*.test.ts`.

Servidor (`apps/server`, NestJS sobre Fastify):

- Arrancar tras compilar: `POPE_MODE=local DATABASE_URL=postgres://… pnpm --filter
  @pope/server start` (variables: `POPE_MODE` obligatoria, `local` o `cloud`;
  `DATABASE_URL` obligatoria; `PORT`, por defecto 3000; `HOST`, por defecto `0.0.0.0`;
  `POPE_MEMORY_LOG_MS`, opcional, de 1000 como mínimo: cada ese tiempo registra una línea
  `Memoria: rss=… MB heapUsed=… MB`, para la prueba de carga; `POPE_DATA_DIR`, opcional:
  carpeta donde el nodo guarda sus archivos, como las fotos de los productos, por defecto
  `apps/server/data/`, que no se sube al repo).
  Al arrancar aplica las migraciones pendientes. Comprobar: `GET /health`.
- Fotos de los productos: el panel las reduce y las sube en WebP (`PUT /products/:id/photo`,
  cuerpo `image/webp` de 512 KB como mucho, sin multipart). El parser de ese tipo está en
  `bootstrap.ts`; el nodo guarda el archivo en `POPE_DATA_DIR/products/`.
- Base de datos (Drizzle): el esquema está en `src/db/schema.ts`. Tras cambiarlo,
  `pnpm --filter @pope/server db:generate` crea la migración SQL en `apps/server/drizzle/`
  (se sube al repo). Nunca edites una migración ya subida: crea otra.
- Tests: por defecto con PGlite (PostgreSQL en WASM, sin instalar nada), usando
  `createTestDatabase()` de `src/testing/database.ts`. Contra PostgreSQL real:
  `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres pnpm --filter
  @pope/server test:pg` (crea y borra una base temporal por test; el usuario necesita
  permiso `CREATEDB`). Pásalo antes de cada entrega al local.
- Sus tests usan `unplugin-swc`, porque esbuild no emite los metadatos de decoradores que
  necesita la inyección de dependencias de NestJS.
- No uses `import type` para clases que se inyectan en un constructor: se perderían esos
  metadatos.
- Todo cambio de estado se hace dentro de `EventsService.inTransaction((tx, emit) => …)`:
  los cambios usan `tx` y cada `emit(evento)` se valida con los esquemas de
  `@pope/shared` y se guarda en la misma transacción (ADR-0008). Nunca insertes en
  `events` a mano.
- Todo endpoint HTTP del nodo local exige sesión del personal (guard global). Marca con
  `@Public()` los que no la necesitan y con `@Roles(...)` los restringidos por rol
  (encargado opera, administrador además configura, dueño solo lee). Valida los cuerpos con
  `new ZodValidationPipe(esquema)` y esquemas de `@pope/shared`.
- Los tests e2e levantan el servidor completo con `createTestApp()` de `src/testing/app.ts`.
- Primer administrador del local (tras compilar): `DATABASE_URL=postgres://… pnpm --filter
  @pope/server staff:create-admin`. Pide usuario, nombre y contraseña, y se niega si ya
  hay un administrador activo.

Panel (`apps/panel`, React + Vite + wouter):

- Desarrollo: con el nodo arrancado en el puerto 3000, `pnpm --filter @pope/panel dev` y abrir
  `http://127.0.0.1:5173`. Vite hace de proxy de la API y del canal `/panel` hacia el nodo,
  así la cookie del personal es del mismo origen. Las rutas del panel van en español
  (`/clientes`) y las de la API en inglés (`/customers`), para que no choquen. Una ruta del panel
  tampoco puede empezar como una de la API (el proxy compara el principio): por eso Combos está en
  `/combo-horas` y no en `/combos`.
- En el local, el nodo sirve el panel compilado (`@fastify/static`, solo en modo `local`): tras
  `pnpm build` (deja el panel en `apps/panel/dist`), arrancar el nodo y abrir
  `http://<IP del nodo>:3000`, sin el servidor de Vite. Las rutas de la API tienen prioridad y
  cualquier otra devuelve `index.html`. Si falta `apps/panel/dist`, el nodo arranca igual y lo
  avisa en el log.
- Diseño de referencia: el lienzo "Panel Pope · Fase 8 (estilo SENET)", a 1920×1080. Estilos
  en `src/theme.css`: colores planos, sin desenfoques ni animaciones (gráfica integrada HD 2000
  del i3-2120). Las llamadas al nodo pasan por `ApiClient` (`src/api/client.ts`), que valida cada
  respuesta con los esquemas de `@pope/shared`.
- Tests solo de la lógica (`src/**/*.test.ts`); las pantallas se verifican a mano.

Shell (`apps/shell-ui`, React + Vite, sin router):

- Desarrollo: con el nodo arrancado en el puerto 3000 y las PCs de ejemplo creadas
  (`dev:seed-pcs`), `pnpm --filter @pope/shell-ui dev` y abrir `http://localhost:5174/?pc=1`
  (`?pc=N` es la PC de ejemplo "PC 0N"). En desarrollo el Shell hace también de agente: envía
  `hello` y los latidos por el WebSocket `/pc`, a través del proxy de Vite. Las pantallas solo
  ven la interfaz `PcChannel` (`src/channel/channel.ts`); con la spec 003 se añadirá el puente de
  WebView2 y la conexión la mantendrá el agente.
- Diseño de referencia: el lienzo "Shell Pope · Fase 9 (estilo SENET)", a 1920×1080. Aquí sí hay
  vidrio y desenfoques (las PCs de los clientes tienen gráfica dedicada). Estilos en
  `src/theme.css`. Tests solo de la lógica (`src/**/*.test.ts`); las pantallas se verifican a mano.

- **ESLint:** un único `eslint.config.mjs` en la raíz (configuración plana) con
  `strictTypeChecked` de `typescript-eslint`. Un paquete solo tiene configuración propia
  si añade reglas (p. ej. React).
- **Prettier:** `.prettierrc.json` en la raíz. Los `.md` no se formatean: la documentación
  se redacta a mano.
- Antes de cada commit: `pnpm format` y luego `pnpm lint`, `pnpm typecheck` y `pnpm test`.

## Ante la duda

Pregunta. Es mejor detenerse que inventar un requisito, contradecir un ADR o romper el
presupuesto de recursos del nodo local.
