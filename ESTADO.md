# Estado del proyecto

> **Punto de entrada para retomar el trabajo.** Si acabas de abrir el proyecto (persona o
> agente de IA), empieza aquí. Este archivo se actualiza **en el mismo commit** que cada
> tarea terminada.

**Última actualización:** 2026-09-30 · T32 terminada (añadir tiempo a una sesión temporal)

## Ahora

| | |
|---|---|
| **Spec en curso** | [001 · Cuentas y sesiones](docs/specs/001-cuentas-y-sesiones/spec.md) |
| **Siguiente tarea** | **T33: Cierre anticipado de sesión temporal** ([tasks.md](docs/specs/001-cuentas-y-sesiones/tasks.md)) |
| **Progreso** | 40 / 60 tareas · fase 6 de 9 (Sesiones temporales) |
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
| [001 Cuentas y sesiones](docs/specs/001-cuentas-y-sesiones/spec.md) | En curso | 40 / 60 |
| [002 Pausa de sesión](docs/specs/002-pausa-de-sesion/spec.md) | Borrador | — |
| [003 Arranque y bloqueo de la PC](docs/specs/003-bloqueo-de-pc/spec.md) | Borrador | — |
| [004 Lista blanca de aplicaciones](docs/specs/004-lista-blanca-de-aplicaciones/spec.md) | Borrador | — |
| [005 Inventario y caja](docs/specs/005-inventario-y-caja/spec.md) | Borrador | — |
| [006 Sincronización y web del dueño](docs/specs/006-sincronizacion-y-web-del-dueno/spec.md) | Borrador | — |
| [007 Autorrecarga por pago móvil](docs/specs/007-autorrecarga-pago-movil/spec.md) | Borrador (futura) | — |
| [008 Migración desde SENET](docs/specs/008-migracion-desde-senet/spec.md) | Borrador | — |

## Bitácora

Las 10 entradas más recientes, la última arriba. El detalle está en `git log`.

- **2026-09-30:** T32. POST /sessions/:id/time: cobra primero lo ya usado y añade el tiempo (por minutos o por importe) con la tarifa de la sesión, ligado al turno de quien cobra, con session_topup y session.time_added; la PC ve el nuevo tiempo al momento. El cierre por agotamiento ya no pisa a un cobro simultáneo (onlyIfExhausted).
- **2026-09-30:** T31. POST /sessions/temporary (encargado y administrador, con turno abierto): abre una sesión temporal en una PC libre y conectada, por minutos (importe redondeado al céntimo) o por importe (segundos truncados), con nombre opcional (Temporal · PC 05 · 18:30). Cobro en session_topups ligado al turno y session.started con el encargado como actor; la PC se desbloquea al momento. Tope de 24 h por cobro (por confirmar).
- **2026-09-30:** T30. buyCombo desde el Shell: cobra la sesión hasta ahora y compra con saldo en la misma transacción, responde con el state y rearma los avisos. Rechazos con código propio (sin sesión, temporal, combo no disponible, cuenta bloqueada, saldo). Fin de la fase 5. La compra con saldo, también desde el panel, descuenta lo ya consumido en la sesión activa.
- **2026-09-30:** T29. Un proceso (cada 10 s y al arrancar el nodo) cierra como no_heartbeat las sesiones sin latidos más que el tiempo de gracia, cobrando hasta el último latido. hello sin sesión con una activa la cierra al momento; si la PC reconecta con una sesión ya cerrada recibe sessionEnded, y una temporal queda con el menor restante (evento session.remaining_corrected). Los temporizadores de T27 no cobran con la PC en silencio.
- **2026-09-30:** T28a. Tabla settings (sin fila vale el valor por defecto) y /settings: el personal lee y solo el administrador cambia; un evento setting.changed por ajuste que cambia. Gracia de latidos 3 min (30 s–30 min) y sesiones temporales por PC 3 (3–100). SettingsService.get lo usarán T29 y T34.
- **2026-09-30:** T27. Cada sesión tiene un temporizador en el Clock del nodo que salta cuando toca el aviso de 5 o 1 min o el agotamiento; el latido hace la misma revisión cada 10 s. Al agotarse cierra con motivo exhausted y la PC se bloquea. Si la PC no está conectada, el aviso se reintenta al volver. El Clock gana schedule() y FakeClock.tick() dispara los temporizadores sin esperar.
- **2026-09-30:** T28. SessionsService.close liquida el consumo en el ledger (hasta 2 filas: combo y dinero, solo lo que había si el saldo bajó), guarda el motivo, emite session.ended y avisa a la PC con sessionEnded. Cierran el cliente (logout desde el Shell) y el personal (POST /sessions/:id/close: 404, 409, solo encargado y administrador).
- **2026-09-30:** T26. Cada heartbeat cobra hasta ahora con el reloj del nodo (combo primero, luego dinero; las temporales, su tiempo comprado), guarda la sesión y responde con el state. La marca avanza segundos enteros, sin perder fracciones. T27 pasa después de T28 porque cerrar por agotamiento necesita la liquidación del ledger. Helper de test PcWorld.
- **2026-09-30:** T25. Mensaje login de la PC: valida credenciales, rechaza si la PC o la cuenta ya tienen sesión (dice en qué PC), exige saldo para 1 min y abre la sesión copiando la tarifa del día con session.started. SessionsService.stateFor da el state de cada PC (también al reconectar).
- **2026-09-30:** T24. Canal de las PCs en `ws://nodo:3000/pc` con `ws` y despachador propio por `type` (`PcProtocolService`); `hello` registra la PC (`unknown_pc` si no existe) y recibe `state`. `requestId` opcional en el protocolo. `PcConnections` envía a cualquier PC; `PcTestClient` simula PCs en los tests.
