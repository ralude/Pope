# Estado del proyecto

> **Punto de entrada para retomar el trabajo.** Si acabas de abrir el proyecto (persona o
> agente de IA), empieza aquí. Este archivo se actualiza **en el mismo commit** que cada
> tarea terminada.

**Última actualización:** 2026-09-30 · T18 terminada (ledger y saldos)

## Ahora

| | |
|---|---|
| **Spec en curso** | [001 · Cuentas y sesiones](docs/specs/001-cuentas-y-sesiones/spec.md) |
| **Siguiente tarea** | **T19: Recargas** ([tasks.md](docs/specs/001-cuentas-y-sesiones/tasks.md)) |
| **Progreso** | 25 / 60 tareas · fase 4 de 9 (Clientes, saldos, tarifas y combos) |
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
- [ ] **Spec 003:** revisar las preguntas abiertas sobre la conexión PC ↔ nodo (cifrado, credencial, pipe, interfaz local, validación en C#).
- [ ] **REQ-001-24:** confirmar el criterio de T07: si una sesión empieza con menos de 1 min, solo se envía el aviso de 1 min (anotado en las preguntas resueltas de la spec 001).
- [ ] **REQ-001-13:** el equivalente en Bs espera a la tasa BCV de la spec 005.
- [ ] **Antes de la spec 003:** decidir los ADR propuestos [0005](docs/adr/0005-shell-react-en-webview2.md), [0009](docs/adr/0009-escritorio-separado-para-bloqueo-y-pausa.md) y [0010](docs/adr/0010-lista-blanca-y-restauracion.md) (cliente Windows).
- [ ] **Spec 008:** averiguar si el plan de SENET del local incluye acceso a la API y quién tiene las credenciales.

## Mapa de specs

| Spec | Estado | Progreso |
|---|---|---|
| [001 Cuentas y sesiones](docs/specs/001-cuentas-y-sesiones/spec.md) | En curso | 25 / 60 |
| [002 Pausa de sesión](docs/specs/002-pausa-de-sesion/spec.md) | Borrador | — |
| [003 Arranque y bloqueo de la PC](docs/specs/003-bloqueo-de-pc/spec.md) | Borrador | — |
| [004 Lista blanca de aplicaciones](docs/specs/004-lista-blanca-de-aplicaciones/spec.md) | Borrador | — |
| [005 Inventario y caja](docs/specs/005-inventario-y-caja/spec.md) | Borrador | — |
| [006 Sincronización y web del dueño](docs/specs/006-sincronizacion-y-web-del-dueno/spec.md) | Borrador | — |
| [007 Autorrecarga por pago móvil](docs/specs/007-autorrecarga-pago-movil/spec.md) | Borrador (futura) | — |
| [008 Migración desde SENET](docs/specs/008-migracion-desde-senet/spec.md) | Borrador | — |

## Bitácora

Las 10 entradas más recientes, la última arriba. El detalle está en `git log`.

- **2026-09-30:** T18. Tablas `ledger` (solo inserción; importe con signo en µUSD o segundos) y `customer_balances` (caché que nunca baja de cero). `WalletService.post(tx, movimiento)` suma y comprueba en una sola sentencia y lanza `InsufficientBalanceError` (409); helper `assertBalancesMatchLedger`.
- **2026-09-30:** Decisiones del mantenedor (se añade T28a; 60 tareas): WebSocket con `ws` y despachador propio por `type`, más `requestId` opcional (ADR-0003); tras un corte de red la sesión cerrada sin latidos sigue cerrada y la temporal corrige su restante con el de la PC (T29 desbloqueada); las temporales cobradas por minutos se redondean al céntimo más cercano; tiempo de gracia y respaldo por PC en la tabla `settings` (T28a).

- **2026-09-30:** T17. Tabla `cash_shifts` (índice único parcial: un turno abierto por
  miembro del personal) y `/shifts` (abrir, `current` y `current/close`) para encargado y
  administrador, con `shift.opened` y `shift.closed`. `@RequiresOpenShift()` responde 409
  sin turno y entrega el turno al endpoint con `@CurrentShift()`.
- **2026-09-25:** T16a. `POST /customers/:id/unlock` (encargado y administrador) quita el bloqueo por intentos y emite `customer.login_unlocked`; sin bloqueo vigente no hace nada. El cliente del panel lleva `loginLockedUntil` para mostrar el botón en la T40.
- **2026-09-25:** T16 (se añade T16a; 59 tareas). `CustomerAuthService.verify`: 5 fallos seguidos bloquean el login 5 min (fijo; un acierto pone el contador a cero) y emiten `customer.login_locked`. Motivos iguales a los códigos del protocolo; el estado de la cuenta solo se revela con la contraseña correcta. Cuatro preguntas resueltas en la spec.
- **2026-09-25:** T15a. Tabla `customers` y `/customers`: alta (encargado y administrador), búsqueda
  paginada por usuario, nombre o teléfono (también el dueño) y cambio de estado con eventos.
- **2026-09-25:** T15 (dividida en T15 y T15a; 58 tareas). Esquemas de clientes en `shared`:
  usuario de 3–32 `[A-Za-z0-9._-]`, contraseña ≥ 4 y teléfono venezolano normalizado.
- **2026-09-25:** T14d. `POST /staff`, `GET /staff` y `PATCH /staff/:id/status` (solo
  administrador) con `staff.status_changed`. **Fin de la fase 3** (servidor base).
- **2026-09-25:** T14c. CLI `staff:create-admin` (contraseña sin eco; admite entrada
  redirigida). Probada de punta a punta con PostgreSQL 18: CLI → login → `/auth/me`.
- **2026-09-25:** T14b. `/auth/login`, `/auth/logout` y `/auth/me` con cookie httpOnly
  (`SameSite=Strict`, `Secure` solo en la nube) y guard global con `@Public()` y `@Roles()`.
