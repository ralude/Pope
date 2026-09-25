# Estado del proyecto

> **Punto de entrada para retomar el trabajo.** Si acabas de abrir el proyecto (persona o
> agente de IA), empieza aquí. Este archivo se actualiza **en el mismo commit** que cada
> tarea terminada.

**Última actualización:** 2026-09-25 · T12 terminada (PostgreSQL, Drizzle y PGlite)

## Ahora

| | |
|---|---|
| **Spec en curso** | [001 · Cuentas y sesiones](docs/specs/001-cuentas-y-sesiones/spec.md) |
| **Siguiente tarea** | **T13: Tabla de eventos y transacciones** ([tasks.md](docs/specs/001-cuentas-y-sesiones/tasks.md)) |
| **Progreso** | 13 / 52 tareas · fase 3 de 9 (Servidor base) |
| **Bloqueos** | Ninguno |

## Cómo retomar

1. Lee [`AGENTS.md`](AGENTS.md): son las reglas del proyecto.
2. Mira la tabla **Ahora** de arriba.
3. Abre el `tasks.md` de la spec en curso y haz **solo** la siguiente tarea sin marcar.
4. En el **mismo commit**:
   - marca la tarea con `[x]` en `tasks.md`;
   - actualiza aquí **Ahora** (siguiente tarea, progreso, fase) y la **Bitácora**.
5. Si algo te bloquea, anótalo en **Bloqueos** y pregunta al mantenedor. No lo rodees.

Para pedírselo a un agente basta con: **"Lee ESTADO.md y continúa con la siguiente tarea."**

## Pendientes del mantenedor

Cosas que no bloquean la tarea actual, pero que alguien tiene que hacer:

- [ ] **T11 y T37:** ejecutar las mediciones en el PC servidor del local (i5 de 2ª gen, 8 GB).
- [ ] **Antes de T24:** decidir el transporte WebSocket (`ws` puro recomendado, en vez de Socket.IO), cómo se enruta `type` en NestJS y si se añade `requestId` al protocolo. Detalle en la nota de T24 de [tasks.md](docs/specs/001-cuentas-y-sesiones/tasks.md).
- [ ] **Antes de T29:** decidir qué pasa si se corta la red entre una PC y el nodo más que el tiempo de gracia (choque entre ADR-0007 y REQ-001-27). Pregunta abierta en la [spec 001](docs/specs/001-cuentas-y-sesiones/spec.md).
- [ ] **Spec 003:** revisar las preguntas abiertas sobre la conexión PC ↔ nodo (cifrado, credencial, pipe, interfaz local, validación en C#).
- [ ] **REQ-001-24:** confirmar el criterio de T07: si una sesión empieza con menos de 1 min, solo se envía el aviso de 1 min (anotado en las preguntas resueltas de la spec 001).
- [ ] **REQ-001-13:** el equivalente en Bs espera a la tasa BCV de la spec 005.
- [ ] **Antes de la spec 003:** decidir los ADR propuestos [0005](docs/adr/0005-shell-react-en-webview2.md), [0009](docs/adr/0009-escritorio-separado-para-bloqueo-y-pausa.md) y [0010](docs/adr/0010-lista-blanca-y-restauracion.md) (cliente Windows).
- [ ] **Spec 008:** averiguar si el plan de SENET del local incluye acceso a la API y quién tiene las credenciales.

## Mapa de specs

| Spec | Estado | Progreso |
|---|---|---|
| [001 Cuentas y sesiones](docs/specs/001-cuentas-y-sesiones/spec.md) | En curso | 13 / 52 |
| [002 Pausa de sesión](docs/specs/002-pausa-de-sesion/spec.md) | Borrador | — |
| [003 Arranque y bloqueo de la PC](docs/specs/003-bloqueo-de-pc/spec.md) | Borrador | — |
| [004 Lista blanca de aplicaciones](docs/specs/004-lista-blanca-de-aplicaciones/spec.md) | Borrador | — |
| [005 Inventario y caja](docs/specs/005-inventario-y-caja/spec.md) | Borrador | — |
| [006 Sincronización y web del dueño](docs/specs/006-sincronizacion-y-web-del-dueno/spec.md) | Borrador | — |
| [007 Autorrecarga por pago móvil](docs/specs/007-autorrecarga-pago-movil/spec.md) | Borrador (futura) | — |
| [008 Migración desde SENET](docs/specs/008-migracion-desde-senet/spec.md) | Borrador | — |

## Bitácora

Las 10 entradas más recientes, la última arriba. El detalle está en `git log`.

- **2026-09-25:** T12. Drizzle + `pg` (pool de 10) con migraciones al arrancar, PGlite para los
  tests y `test:pg` contra PostgreSQL real (18.6, instalado con scoop en desarrollo).
- **2026-09-25:** T11. `PasswordService` con argon2id (m=19 MiB, t=2, p=1) y `bench:argon2`.
  En la máquina de desarrollo: 10 ms por hash. **Falta medir en el i5 de 2ª gen.**
- **2026-09-25:** T10. `apps/server` (ESM, NestJS 12 + Fastify) con `POPE_MODE` obligatoria,
  configuración validada con zod y `/health`. En reposo ocupa ~87 MB (límite: 384 MB).
- **2026-09-25:** Revisada la conexión NestJS ↔ .NET ↔ WebView2. Decisiones pendientes
  anotadas antes de T24 (transporte `ws`, `requestId`) y T29 (corte de red), y en las
  preguntas abiertas de la spec 003.
- **2026-09-25:** T09b. Eventos de sesión (`started`, `ended` con `billedUntil`, `time_added`,
  `restored`). **Fin de la fase 2:** `@pope/shared` tiene dinero, tiempo, tarifas, motor de
  cobro, avisos, protocolo PC ↔ nodo y eventos, con 102 tests.
- **2026-09-25:** T09 (dividida en T09 y T09b por tamaño; ahora son 52 tareas). Eventos con
  formato común, actor con copia del nombre y objetos estrictos: cuentas, saldo, combos,
  tarifas y turno. Método de pago como lista fija.
- **2026-09-25:** T08. Protocolo PC ↔ nodo en zod (`hello`, `heartbeat`, `login`, `logout`,
  `buyCombo`, `state`, `warning`, `sessionEnded`, `error`); el build genera su JSON Schema
  en `packages/shared/dist/json-schema/` para el agente en C#.
- **2026-09-25:** T07. `secondsUntilExhausted` (mismo tope que el cobro), checkpoint y restante
  de sesiones temporales, y `pendingWarnings` (5 y 1 min, con rearme).
- **2026-09-25:** T06. Motor de cobro `applyCheckpoint`: combo antes que dinero, importe
  recalculado sobre el total (sin deriva, probado con 500 casos aleatorios) y tope en
  `floor(saldo × 3600 / tarifa)` segundos, que coincide con el tiempo que ve el cliente.
- **2026-09-25:** T05. `weekdayInCaracas` (ISO 8601: 1 = lunes) con `Intl`, `rateFor` y el
  esquema de la tabla de 7 días.
- **2026-09-25:** T04. `Micros`, `Seconds`, `formatMoney` (`3,00 USD (≈ 120,00 VES)`, mitad
  hacia arriba) y `formatDuration`. Resueltas en la spec 4 dudas de la fase 2 (redondeo,
  formato VES, tope de saldo y avisos).
- **2026-09-25:** T03. Primer paquete, `@pope/shared` (ESM, build con `tsc`), con Vitest 5
  y un test de humo. Fin de la fase 1: el monorepo compila, pasa lint y ejecuta tests.
- **2026-09-25:** T02. ESLint 10 (configuración plana única en la raíz, `strictTypeChecked`)
  y Prettier 3. `pnpm lint` comprueba el formato y luego lanza ESLint en cada paquete.
