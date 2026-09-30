# Estado del proyecto

> **Punto de entrada para retomar el trabajo.** Si acabas de abrir el proyecto (persona o
> agente de IA), empieza aquí. Este archivo se actualiza **en el mismo commit** que cada
> tarea terminada.

**Última actualización:** 2026-09-30 · T36b terminada (consola interactiva del simulador)

## Ahora

| | |
|---|---|
| **Spec en curso** | [001 · Cuentas y sesiones](docs/specs/001-cuentas-y-sesiones/spec.md) |
| **Siguiente tarea** | **T37a: Registro de memoria del servidor** ([tasks.md](docs/specs/001-cuentas-y-sesiones/tasks.md)) |
| **Progreso** | 47 / 64 tareas · fase 7 de 9 (Simulador y rendimiento) |
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
- [ ] **T28a:** confirmar los límites de los ajustes: gracia de latidos entre 30 s y 30 min, sesiones temporales conservadas entre 3 y 100 (la spec solo fija el 3 mínimo y el 3 min por defecto).
- [ ] **T31:** confirmar dos criterios al abrir una sesión temporal: el tope de 24 h por cobro y que la PC deba estar conectada al nodo (si no, se cobraría por una PC que no puede desbloquearse).
- [ ] **REQ-001-13:** el equivalente en Bs espera a la tasa BCV de la spec 005.
- [ ] **Antes de la spec 003:** decidir los ADR propuestos [0005](docs/adr/0005-shell-react-en-webview2.md), [0009](docs/adr/0009-escritorio-separado-para-bloqueo-y-pausa.md) y [0010](docs/adr/0010-lista-blanca-y-restauracion.md) (cliente Windows).
- [ ] **Spec 008:** averiguar si el plan de SENET del local incluye acceso a la API y quién tiene las credenciales.

## Mapa de specs

| Spec | Estado | Progreso |
|---|---|---|
| [001 Cuentas y sesiones](docs/specs/001-cuentas-y-sesiones/spec.md) | En curso | 47 / 64 |
| [002 Pausa de sesión](docs/specs/002-pausa-de-sesion/spec.md) | Borrador | — |
| [003 Arranque y bloqueo de la PC](docs/specs/003-bloqueo-de-pc/spec.md) | Borrador | — |
| [004 Lista blanca de aplicaciones](docs/specs/004-lista-blanca-de-aplicaciones/spec.md) | Borrador | — |
| [005 Inventario y caja](docs/specs/005-inventario-y-caja/spec.md) | Borrador | — |
| [006 Sincronización y web del dueño](docs/specs/006-sincronizacion-y-web-del-dueno/spec.md) | Borrador | — |
| [007 Autorrecarga por pago móvil](docs/specs/007-autorrecarga-pago-movil/spec.md) | Borrador (futura) | — |
| [008 Migración desde SENET](docs/specs/008-migracion-desde-senet/spec.md) | Borrador | — |

## Bitácora

Las 10 entradas más recientes, la última arriba. El detalle está en `git log`.

- **2026-09-30:** T36b. Subcomando interactive: consola con login, logout, red, reinicio, apagon, luz y estado sobre PCs simuladas. Probada contra PostgreSQL real: el corte de red de 20 s mantiene la sesión, el apagón la cierra sin latidos y el reinicio con la sesión ya nombrada la cierra al momento.
- **2026-09-30:** T36a. CLI del simulador: seed (crea sim01…simNN y los recarga por la API del panel, con turno propio, idempotente) y run (PCs simuladas con --login y --duration). Probado contra PostgreSQL real: 5 PCs entran con 2:00:00 y salen con 0,05 USD menos tras 2 min; el ledger y los eventos cuadran. La prueba destapó que Fastify rechaza content-type JSON sin cuerpo.
- **2026-09-30:** T36. Paquete tools/agent-sim (@pope/agent-sim) sin dependencias nuevas y clase SimulatedPc: hello, latido cada 10 s siempre, restante local, reconexión 1-30 s, corte de red, reinicio y apagón (sin cerrar la conexión, como en la realidad), login con latencia. 15 tests con conexión falsa y reloj simulado.
- **2026-09-30:** T35a. devPcId y devPcName pasan a shared (de 1 a 99, con RangeError fuera de rango) y seedDevPcs/dev:seed-pcs admiten --count para crear hasta 99 PCs; sin duplicar al repetir.
- **2026-09-30:** Revisión de T25–T35: 10 correcciones (no cobrar el tiempo de una PC muerta, no cerrar una sesión que la PC no llegó a conocer con la columna pc_confirmed_at, restante local en el hello, nada llega tarde tras un cierre, un solo sessionEnded, venta de combo en el panel cobrando antes la sesión, estado de la cuenta al abrir, importes en céntimos, claves de ajustes y compra de combo sin duplicados). Fase 7 partida en T35a, T36, T36a, T36b, T37a y T37 con las decisiones del mantenedor; el plan describe el comportamiento del agente en el canal y AGENTS.md añade el ámbito tools.
- **2026-09-30:** T35. POST /sessions/:id/restore con la PC de destino: la sesión nueva continúa con el tiempo restante, sin cobro, enlazada a la original y con session.restored. Solo una vez (dice quién y cuándo), hasta 48 h desde el corte y solo si la cortó un corte con tiempo restante. Sin exigir turno. Fin de la fase 6 (Sesiones temporales).
- **2026-09-30:** T34. GET /sessions/temporary/backup (últimas N por PC, N del ajuste, más las interrumpidas pendientes) y GET /sessions/temporary/interrupted (cerradas sin latidos con tiempo restante, sin restaurar y dentro de 48 h desde el último latido). Cada sesión temporal lleva interruption (pending, restored o expired). Las cerradas por cliente, encargado o agotamiento no aparecen como interrumpidas.
- **2026-09-30:** T33. Sin código nuevo: el cierre de T28 ya descarta el sobrante de una temporal (cliente o encargado): sin devolución en el ledger ni en los cobros, y el tiempo perdido queda en session.ended. Tests de CA-001-09 y helpers de PcWorld (cashier, api, openTemporary).
- **2026-09-30:** T32. POST /sessions/:id/time: cobra primero lo ya usado y añade el tiempo (por minutos o por importe) con la tarifa de la sesión, ligado al turno de quien cobra, con session_topup y session.time_added; la PC ve el nuevo tiempo al momento. El cierre por agotamiento ya no pisa a un cobro simultáneo (onlyIfExhausted).
- **2026-09-30:** T31. POST /sessions/temporary (encargado y administrador, con turno abierto): abre una sesión temporal en una PC libre y conectada, por minutos (importe redondeado al céntimo) o por importe (segundos truncados), con nombre opcional (Temporal · PC 05 · 18:30). Cobro en session_topups ligado al turno y session.started con el encargado como actor; la PC se desbloquea al momento. Tope de 24 h por cobro (por confirmar).
