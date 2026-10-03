# Plan 002: Pausa de sesión

- **Estado:** Aprobado (2026-10-02)
- **Spec:** [spec.md](spec.md)
- **ADRs que aplican:** ADR-0001 (local-first), ADR-0007 (el nodo decide), ADR-0008 (eventos),
  ADR-0011 (recursos) y ADR-0015 (micro-unidades). **ADR-0009** (escritorio separado) sigue
  **Propuesto**: la fase 1 no depende de él; hay que decidirlo antes de la fase 2.
- **ADRs nuevos que propone:** ninguno.

## Resumen

La pausa se construye en **dos fases** (decisión del mantenedor, 2026-10-02):

- **Fase 1 (ahora, todo en TypeScript):** el nodo pausa y reanuda, deja de cobrar en el
  instante (REQ-002-03), aplica los límites por sesión, por día y de duración, y genera los
  eventos. El panel ve las PCs en pausa en morado y puede reanudarlas o cerrarlas. El Shell
  ofrece **Pausar** (hoy desactivado) y muestra la pantalla de pausa, probado con el canal de
  desarrollo como el resto del Shell.
- **Fase 2 (con la spec 003):** el agente y el host en C# llevan la pantalla de pausa a un
  **escritorio separado** que no deja pasar teclas ni clics a las aplicaciones (REQ-002-04,
  CA-002-02), silencian la PC (REQ-002-07) y se mide REQ-002-50 (< 1 s).

En la fase 1 la pantalla de pausa es del Shell: en el navegador no bloquea el teclado del
sistema, igual que el bloqueo de la spec 001 antes de la 003.

## Componentes afectados

| Componente | Fase | Cambio |
|---|---|---|
| `packages/shared` | 1 | Ajustes de la pausa, mensajes `pause`/`resume` del canal, campo `pause` del `state`, eventos `session.paused`/`resumed`/`pause_expired`, reglas puras de los límites |
| `apps/server` | 1 | Tabla `session_pauses`, pausa y reanudación en `SessionsService`, cobro que se detiene, vencimiento de la pausa con temporizador, endpoint del panel para reanudar |
| `apps/panel` | 1 | Estado "en pausa" (morado) en el mapa, la leyenda y el detalle, con «Reanudar» y «Cerrar sesión» |
| `apps/shell-ui` | 1 | Botón **Pausar** activo, confirmación, pantalla de pausa y «Reanudar» con «¿Eres juan?» |
| `tools/agent-sim` | 1 | Pausar y reanudar desde el simulador, para probar varias PCs |
| `apps/native` | 2 | Escritorio separado para la pausa y silencio del audio (spec 003) |

## Modelo de datos

Una tabla nueva y cinco ajustes. Nada se borra: las pausas son auditoría (ADR-0008).

| Tabla | Campos | Notas |
|---|---|---|
| `session_pauses` | id (UUIDv7), session_id, customer_id, started_at, max_until (`started_at` + duración máxima), billing_resumed_at?, ended_at?, end_reason? (`resumed`/`staff_resumed`/`expired_closed`/`session_closed`), started_by (actor), ended_by? (actor) | Una fila por pausa. La pausa abierta de una sesión es la fila sin `ended_at` (índice único parcial por `session_id`). `customer_id` sirve para contar las pausas del día (REQ-002-24) |

**Ajustes** (en `settingsSchema` de `@pope/shared`, tabla `settings` de la spec 001; los cambia
el administrador con `PUT /settings` y generan su evento como los demás):

| Ajuste | Por defecto | Límites | REQ |
|---|---|---|---|
| `pauseEnabled` | `1` | `1` (activada) o `0`: un número, como `allowNegativeStock` de la spec 005, porque `setting.changed` solo admite números y textos (mantenedor, 2026-10-03) | 002-23 |
| `pauseMaxSeconds` | 900 (15 min) | 1 a 60 min | 002-20 |
| `pauseMaxPerSession` | 3 | 1 a 20 | 002-21 |
| `pauseMaxPerDay` | 5 | 1 a 50 | 002-24 |
| `pauseOverrun` | `resume_billing` | `resume_billing` (a) o `close` (b) | 002-22 |

Una pantalla de "Ajustes" en el panel sigue pendiente (ya lo estaba en la spec 001): hasta
entonces, por la API.

## Cobro durante la pausa

Se apoya en el checkpoint de la spec 001, que cobra `ahora − last_heartbeat_at` en cada latido:

1. **Al pausar** (en una transacción): checkpoint hasta ahora, como si llegara un latido, y se
   abre la fila de `session_pauses`. Desde ese instante no se cobra (REQ-002-03).
2. **Durante la pausa**, cada latido mueve `last_heartbeat_at` a ahora **sin cobrar**. Así, al
   reanudar, el primer checkpoint solo cuenta desde la reanudación.
3. **Al reanudar:** se cierra la fila y se pone `last_heartbeat_at` = ahora. Se cobra de nuevo.
4. **Al vencer la pausa** (`max_until`), según `pauseOverrun`:
   - a) `resume_billing`: se guarda `billing_resumed_at` = `max_until` y `last_heartbeat_at` =
     `max_until`. Se cobra desde entonces aunque la PC siga en la pantalla de pausa, hasta que
     el cliente pulse **Reanudar** (CA-002-05). Si se agota el saldo, la sesión termina como
     cualquier otra (`exhausted`).
   - b) `close`: la sesión se cierra con motivo `pause_expired` (motivo nuevo de
     `sessionEndReasonSchema`), cobrada hasta el inicio de la pausa.
   En los dos casos se emite `session.pause_expired` con lo que se hizo.

El vencimiento lo dispara un temporizador por pausa, como los que ya avisan del fin del tiempo
(`watch`). Si el nodo se reinicia, al arrancar revisa las pausas abiertas y aplica las que
vencieron mientras estaba apagado, con la hora de `max_until` (REQ-002-31).

## Latidos, cortes y reinicios en pausa (REQ-002-30, REQ-002-31)

- **Sin latidos durante la pausa:** la revisión de sesiones sin latidos (REQ-001-27) **no
  cierra** una sesión en pausa mientras no se cobre: no hay nada que cobrar y la spec 002 pide
  que siga en pausa. Si vence con la opción a), cuenta la gracia desde `max_until`.
- **La PC se reinicia en pausa** (corte de luz): llega con `hello` sin sesión. Para una sesión
  activa la spec 001 la cerraría; **en pausa no se cierra**: el nodo le manda el `state` con la
  pausa y la PC vuelve a la pantalla de pausa (ADR-0007: la PC obedece).
- **Se va la luz del nodo:** al volver, las pausas siguen abiertas en la base; se aplica el
  punto anterior y los vencimientos pendientes.

## Contratos (`packages/shared`, zod)

**Canal PC ↔ nodo** (cambios compatibles con el protocolo v1):

| Dirección | Mensaje | Notas |
|---|---|---|
| PC → nodo | `pause` (`requestId`?) | Responde un `state` con la pausa y su `requestId`, o un `error` |
| PC → nodo | `resume` (`requestId`?) | Responde un `state` sin pausa y su `requestId` |
| nodo → PC | `state` activo con cuenta: campo nuevo `pause` | `{ startedAt, maxUntil, billing }` o `null`; `billing` es `true` tras vencer con la opción a) |
| nodo → PC | `state` activo con cuenta: campo nuevo `pausesLeft` | Las que quedan: el mínimo entre las de la sesión y las del día; `0` si la pausa está desactivada (REQ-002-02, CA-002-04, CA-002-06) |
| nodo → PC | `state` activo con cuenta: campo nuevo `pauseLimit` | Por qué no se puede pausar: `null` si quedan pausas, `'session'` o `'day'` según el límite alcanzado, `'disabled'` si la pausa está desactivada. Así el Shell elige el mensaje (CA-002-04, CA-002-06; mantenedor, 2026-10-03) |
| nodo → PC | `error` con código nuevo `pause_unavailable` | Sesión temporal, pausa desactivada, sin pausas o ya en pausa, con su texto en español |

Los campos nuevos del `state` son opcionales para que el simulador y los agentes que no los
conocen sigan funcionando.

**API del panel:** `POST /sessions/:id/resume` (encargado y administrador; REQ-002-13).
Cerrar ya existe (`POST /sessions/:id/close`). El mapa del panel (`PcMapSession`) gana
`pause` con el mismo formato, para pintar el morado y el tiempo de pausa restante.

**Eventos** (versión 1, con actor):

| Evento | Datos |
|---|---|
| `session.paused` | `sessionId`, `pcId`, número de pausa en la sesión y en el día |
| `session.resumed` | `sessionId`, segundos en pausa, quién reanudó (cliente o personal) |
| `session.pause_expired` | `sessionId`, `action` (`resume_billing` o `close`) |

## Shell (diseño "Shell Pope · Fase 9")

- **Pausar:** el botón de la barra superior (hoy desactivado) se activa en sesiones con cuenta
  y con `pausesLeft` > 0. Si no quedan: desactivado con "Sin pausas disponibles" o "Sin
  pausas disponibles hoy" (CA-002-04, CA-002-06), según `pauseLimit`. Con la pausa
  desactivada en el local, también desactivado y con un mensaje (mantenedor, 2026-10-03). En
  temporales no aparece (CA-002-07).
- **Confirmación** (REQ-002-02): "Los juegos online pueden desconectarte" y "Te quedan N
  pausas", con «Pausar» y «Seguir jugando».
- **Pantalla de pausa** (REQ-002-06), con vidrio sobre el fondo: el tiempo de pausa que queda
  (en el formato sin segundos, salvo el último minuto, que cuenta en segundos), las pausas que
  quedan y el saldo, que no cambia. Si vence con la opción a): "Tu tiempo vuelve a correr" en
  ámbar y el restante de la sesión bajando.
- **Reanudar** (REQ-002-10): «Reanudar» abre "¿Eres juan?" con «Sí, reanudar» y «Cancelar»
  (CA-002-03).
- Hay que añadir esta pantalla al lienzo del Shell antes de programarla.

## Panel (diseño "Panel Pope · Fase 8")

- **Mapa:** tipo de baldosa nuevo `paused`, en morado (`--accent`), con el tiempo de pausa
  restante debajo en lugar del restante de la sesión. Fila "En pausa" en la leyenda.
  Si venció con la opción a), borde ámbar: está cobrando aunque la PC siga en pausa (CA-002-05).
- **Detalle de la PC:** "En pausa desde 18:05 · quedan 12 min", pausas usadas en la sesión y
  hoy, y los botones «Reanudar» y «Cerrar sesión» (REQ-002-13, CA-002-08).
- Hay que añadir el estado al artboard del mapa del lienzo del panel.

## Fase 2 (con la spec 003)

- El host del Shell pasa la pantalla de pausa al escritorio separado de ADR-0009 y vuelve al
  escritorio del cliente al reanudar, sin cerrar sus aplicaciones (REQ-002-04, REQ-002-05).
- El agente silencia el audio al pausar y restaura el volumen al reanudar (REQ-002-07).
- Se mide REQ-002-50 en una PC del local y se verifica CA-002-02.
- Estas tareas se añadirán a `tasks.md` cuando la spec 003 tenga plan.

## Seguridad

- El nodo comprueba todo (ADR-0007): que la sesión sea de esta PC, con cuenta, que queden
  pausas y que no esté ya en pausa. El Shell solo muestra lo que permite el `state`.
- Reanudar sin contraseña es un riesgo aceptado por el mantenedor: otra persona puede reanudar
  y usar el saldo del cliente. Lo mitigan la confirmación con el nombre y la vista del
  encargado.

## Dependencias de otras specs

- **Spec 001:** checkpoint del cobro, sesiones, ajustes, canal del panel y del Shell.
- **Spec 003:** la fase 2 entera; el color morado ya está en REQ-003-21.

## Impacto en recursos (ADR-0011)

Una fila por pausa (unas pocas por sesión) y un temporizador por pausa abierta, como mucho uno
por PC. Sin dependencias nuevas. En el panel, un tipo de baldosa más.

## Estrategia de pruebas

| Nivel | Qué | REQ / CA |
|---|---|---|
| Unitarias (shared) | Pausas que quedan (sesión y día), vencimiento con a) y b) | 002-20 a 24 |
| e2e (server + PGlite) | Pausar y reanudar no cobran la pausa; límites por sesión y por día; temporal rechazada; vencimiento a) cobra desde `max_until` y b) cierra; reinicio de la PC en pausa la mantiene; sin latidos en pausa no se cierra; reanudar desde el panel; eventos | CA-002-01, 03 a 08 |
| Unitarias (Shell y panel) | Textos y estados de la pantalla de pausa y de la baldosa | 002-06, 14 |
| A mano (fase 1) | Shell y panel en Chrome con el canal de desarrollo y el simulador | CA-002-03 a 08 |
| A mano (fase 2) | En una PC real: teclas bloqueadas, audio, < 1 s | CA-002-02, 002-07, 002-50 |

## Orden de implementación (fase 1; detalle en `tasks.md` cuando se apruebe)

1. Contratos, ajustes y reglas puras en `shared`.
2. Tabla `session_pauses` y pausa/reanudación en el nodo, con el cobro detenido.
3. Vencimiento de la pausa (a y b), reinicios y latidos en pausa.
4. Reanudar desde el panel y la pausa en el mapa del panel (con su artboard en el lienzo).
5. Pausar, confirmación y pantalla de pausa en el Shell (con su artboard en el lienzo).
6. Pausar y reanudar en el simulador.
7. Verificación de la fase 1.

## Riesgos

- **La pantalla de pausa de la fase 1 no bloquea de verdad** el teclado ni las aplicaciones:
  es la fase 2 la que cumple REQ-002-04. Hasta entonces la pausa es funcional (cobro y límites)
  pero no protege.
- **Juegos online:** al volver de la pausa algunos juegos se habrán desconectado. Se avisa
  antes de pausar (REQ-002-02); no hay nada más que Pope pueda hacer.
- **Saldo agotado durante una pausa vencida con a):** la sesión termina como cualquier otra y
  la PC vuelve al bloqueo; el cliente lo verá al volver. Es lo que pide REQ-002-22 a).
