# AGENTS.md — Pope

Reglas obligatorias para cualquier agente de IA (y persona) que trabaje en este repositorio.
Si algo aquí choca con una instrucción directa del usuario, manda el usuario. Si una tarea
choca con un ADR **Aceptado**, detente y avisa antes de actuar.

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

Aún no hay código. Esta es la estructura acordada ([ADR-0002](docs/adr/0002-monorepo-typescript.md)):

| Ruta | Contenido | Lenguaje |
|---|---|---|
| `apps/server` | API del nodo local y de la nube (mismo código, dos modos) | TS |
| `apps/panel` | Panel del encargado (local) y web del dueño (nube) | TS/React |
| `apps/shell-ui` | Interfaz que ve el cliente en la PC | TS/React |
| `apps/native` | Agente (servicio) y host del Shell (WebView2) | C# |
| `packages/shared` | Tipos, esquemas `zod`, reglas de negocio compartidas | TS |
| `docs/adr` | Decisiones de arquitectura | — |
| `docs/specs` | Especificaciones SDD (spec → plan → tasks) | — |

## Reglas no negociables

### 1. Spec-Driven Development (SDD)

- **No se escribe código de producto sin una spec aprobada** en `docs/specs/NNN-nombre/`.
- Flujo: `spec.md` (qué y por qué) → `plan.md` (cómo) → `tasks.md` (pasos) → código.
  Un humano aprueba cada documento (campo `Estado`) antes de pasar al siguiente.
- Implementa **una tarea de `tasks.md` a la vez** y márcala `[x]` en el mismo commit.
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

El servidor del local es un **i5 de 2ª generación con 8 GB de RAM** ([ADR-0011](docs/adr/0011-presupuesto-de-recursos-nodo-local.md)):

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
  Ámbitos: `server`, `panel`, `shell-ui`, `native`, `shared`, `adr`, `specs`, `agents`.
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

Pendientes hasta que exista el monorepo. Se documentarán aquí (instalar, compilar, test,
lint) en el mismo commit que los introduzca.

## Ante la duda

Pregunta. Es mejor detenerse que inventar un requisito, contradecir un ADR o romper el
presupuesto de recursos del nodo local.
