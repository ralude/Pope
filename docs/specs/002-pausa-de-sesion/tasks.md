# Tareas 002: Pausa de sesión

- **Estado:** Aprobado (mantenedor, 2026-10-03). Solo la fase 1.
- **Plan:** [plan.md](plan.md)

Reglas: una tarea = un commit. Marca `[x]` en el mismo commit que la implementa. Cada
commit deja el repo compilando y con `pnpm test` en verde. Los tests nombran el REQ que
prueban. Si una tarea resulta más grande de lo previsto (> 400 líneas), divídela aquí
antes de seguir.

Estas tareas son la **fase 1** del plan, toda en TypeScript: el nodo pausa, reanuda, deja de
cobrar y aplica los límites; el panel ve las PCs en pausa; el Shell ofrece **Pausar** y
muestra la pantalla de pausa, que en el navegador aún no bloquea el teclado. La **fase 2**
(escritorio separado, silencio y < 1 s: REQ-002-04, REQ-002-05, REQ-002-07, REQ-002-50 y
CA-002-02) se añadirá aquí cuando la spec 003 tenga plan.

## Decidido al aprobar

Al repasar el plan contra el código salieron cuatro huecos. El mantenedor decidió las tres
primeras el 2026-10-03 (anotadas ya en el plan); la cuarta sigue abierta.

1. **¿Cómo sabe el Shell qué mensaje poner?** El plan manda un solo número, `pausesLeft`, el
   menor entre las pausas que quedan en la sesión y en el día. Con él el Shell no distingue
   "Sin pausas disponibles" (CA-002-04) de "Sin pausas disponibles hoy" (CA-002-06).
   **Decidido:** el `state` lleva además `pauseLimit`: `null` si quedan pausas, `'session'` o
   `'day'` según el límite que se alcanzó, y `'disabled'` con la pausa desactivada (T03).
2. **Con la pausa desactivada en el local (REQ-002-23), ¿el botón Pausar se ve?** El plan
   manda `pausesLeft: 0`, que lo dejaría desactivado sin mensaje. **Decidido:** se ve
   desactivado y con un mensaje; `pauseLimit` vale `'disabled'` (T03, T16). El texto se
   decide con el diseño del Shell (T14).
3. **`pauseEnabled` como número.** El plan lo pone como booleano, pero el evento
   `setting.changed` solo admite números y textos. **Decidido:** `1` o `0`, como
   `allowNegativeStock` de la spec 005 (T01).
4. **Los ajustes de la pausa en el panel.** El plan los deja en la API porque no había
   pantalla de ajustes; ahora existe «Ajustes del local» (spec 005, T23b). **Abierta.** Propuesta: de
   momento, por la API como dice el plan, y añadirlos a «Ajustes del local» en una tarea
   aparte cuando el mantenedor lo pida, junto a la gracia de latidos y las temporales
   conservadas de la spec 001, que tampoco tienen pantalla.

## Fase 1: Contratos (`packages/shared`)

- [x] **T01: Ajustes de la pausa**
  - **Cubre:** REQ-002-20, REQ-002-21, REQ-002-22, REQ-002-23, REQ-002-24
  - **Hacer:** en `settingsSchema` y `DEFAULT_SETTINGS`: `pauseEnabled` (1 o 0, por defecto 1), `pauseMaxSeconds` (60 a 3600, por defecto 900), `pauseMaxPerSession` (1 a 20, por defecto 3), `pauseMaxPerDay` (1 a 50, por defecto 5) y `pauseOverrun` (`resume_billing` o `close`, por defecto `resume_billing`).
  - **Verificar:** tests de los límites y valores por defecto en shared; e2e en el servidor: `PUT /settings` los acepta, rechaza los que se salen y emite `setting.changed` v2.
  - **Commit:** `feat(shared): añade los ajustes de la pausa`
  - **Decidido al implementarla:** el esquema exporta además `pauseOverrunSchema` (`resume_billing` o `close`), que usarán las reglas (T02) y el evento de vencimiento (T04). No hace falta migración: un ajuste sin fila en `settings` vale su valor por defecto. La pantalla «Ajustes del local» del panel no cambia: solo envía lo que se edita en ella.

- [x] **T02: Reglas puras de la pausa**
  - **Cubre:** REQ-002-11, REQ-002-20, REQ-002-21, REQ-002-22, REQ-002-23, REQ-002-24
  - **Hacer:** funciones sin efectos en `packages/shared/src/pause.ts`: pausas que quedan (sesión y día) y qué límite se alcanzó; si una sesión puede pausar y por qué no (temporal, desactivada, sin pausas en la sesión o en el día, ya en pausa), con su texto en español; hasta cuándo dura una pausa (`maxUntil`); qué pasa al vencer según `pauseOverrun`; y el día de una pausa en hora de Caracas (con `LOCAL_TIME_ZONE`).
  - **Verificar:** tests unitarios, incluido el cambio de día a medianoche de Caracas (las 04:00 UTC).
  - **Commit:** `feat(shared): añade las reglas de la pausa`
  - **Decidido al implementarla:** `pause.ts` con `pauseLimitSchema` (`session`, `day`, `disabled`), `pauseAllowance` (pausas que quedan y el límite alcanzado), `pauseRefusal` y `PAUSE_REFUSAL_MESSAGES`, `pauseMaxUntil`, `pauseSecondsLeft`, `pauseExpired` y `pausesOnDayOf` (cuenta por `localDateInCaracas`, así el nodo no necesita zonas horarias en SQL). Lo que pasa al vencer es el propio ajuste `pauseOverrun`: no necesita función. **Decidido por el mantenedor (2026-10-03):** los textos de los rechazos que la spec no fijaba ("Las sesiones temporales no se pueden pausar", "La pausa no está disponible en este local", "Tu sesión ya está en pausa") y que, si se agotan a la vez los dos límites, manda el del día.

- [ ] **T03: Contratos del canal y del mapa**
  - **Cubre:** REQ-002-01, REQ-002-02, REQ-002-06, REQ-002-10, REQ-002-14, REQ-002-22
  - **Hacer:** mensajes `pause` y `resume` (con `requestId` opcional); en el `state` activo con cuenta, los campos opcionales `pause` (`{ startedAt, maxUntil, billing }` o `null`), `pausesLeft` y `pauseLimit` (pregunta 1); código de error `pause_unavailable`; motivo de cierre `pause_expired` en `sessionEndReasonSchema`; en `pcMapSessionSchema`, `pause` y las pausas usadas en la sesión y en el día. Regenerar el JSON Schema del canal para el agente en C#.
  - **Verificar:** tests de los esquemas; un `state` sin los campos nuevos sigue siendo válido (simulador y agentes antiguos).
  - **Commit:** `feat(shared): añade la pausa al canal de la PC y al mapa`

- [ ] **T04: Eventos de la pausa**
  - **Cubre:** REQ-002-32
  - **Hacer:** `session.paused` (sesión, PC, número de pausa en la sesión y en el día), `session.resumed` (sesión, segundos en pausa, quién reanudó: cliente o personal) y `session.pause_expired` (sesión, `action`), versión 1 y con actor. `session.ended` acepta el motivo `pause_expired`: solo añade un valor, así que los eventos ya guardados siguen siendo válidos.
  - **Verificar:** tests de `events.test.ts`.
  - **Commit:** `feat(shared): añade los eventos de la pausa`

## Fase 2: Nodo (`apps/server`)

- [ ] **T05: Tabla de pausas**
  - **Cubre:** REQ-002-21, REQ-002-24, REQ-002-31
  - **Hacer:** tabla `session_pauses` del plan, con su migración (`db:generate`): índice único parcial por `session_id` donde `ended_at` es nulo (una sola pausa abierta por sesión) e índice por `customer_id` y `started_at` para contar las del día.
  - **Verificar:** `db/migrations.test.ts`; la migración se aplica con PGlite y con `test:pg`.
  - **Commit:** `feat(server): añade la tabla de pausas`

- [ ] **T06: Pausar y reanudar desde la PC, sin cobrar la pausa**
  - **Cubre:** REQ-002-03, REQ-002-11, REQ-002-32, CA-002-01, CA-002-07
  - **Hacer:** un servicio nuevo para la pausa (`SessionsService` ya pasa de 900 líneas) y los mensajes `pause` y `resume` del canal. Pausar, en una transacción con la sesión bloqueada: comprobar que es con cuenta, de esta PC y no está ya en pausa; cobrar hasta ahora; abrir la fila y emitir `session.paused`. Reanudar: cerrar la fila (`resumed`), poner `last_heartbeat_at` en ahora y emitir `session.resumed`. **El checkpoint no cobra mientras la pausa no cobra**, lo llame quien lo llame (latido, temporizador, cierre, compra de combo, cambio de tasa): mueve `last_heartbeat_at` a ahora sin cobrar. Los avisos de 5 y 1 min no se programan durante la pausa. Cualquier cierre de la sesión cierra su pausa abierta (`session_closed`). El `state` lleva `pause`.
  - **Verificar:** e2e: CA-002-01 (60 min de saldo, 10 de pausa, al reanudar le quedan 60 menos lo usado antes); una temporal recibe `pause_unavailable` (CA-002-07); pausar dos veces seguidas; una compra de combo o un cambio de tasa en pausa no cobran; los tres eventos con su actor.
  - **Commit:** `feat(server): pausa y reanuda la sesión sin cobrar la pausa`

- [ ] **T07: Límites de pausas por sesión y por día**
  - **Cubre:** REQ-002-21, REQ-002-23, REQ-002-24, CA-002-04, CA-002-06
  - **Hacer:** al pausar, contar las pausas de la sesión y las de la cuenta en el día de Caracas; rechazar con `pause_unavailable` y su texto si no quedan o si la pausa está desactivada. Cada `state` de una sesión con cuenta lleva `pausesLeft` y `pauseLimit`, también fuera de la pausa, para que el Shell pinte el botón.
  - **Verificar:** e2e: tras 3 pausas en la sesión, `pausesLeft` 0 con `pauseLimit` `session` y la cuarta rechazada (CA-002-04); 5 pausas en dos sesiones del mismo día dejan la tercera sesión sin pausas con `day` (CA-002-06), y al día siguiente vuelven; con `pauseEnabled` 0, `disabled`.
  - **Commit:** `feat(server): limita las pausas por sesión y por día`

- [ ] **T08: Vencimiento de la pausa**
  - **Cubre:** REQ-002-20, REQ-002-22, REQ-002-31, REQ-002-32, CA-002-05
  - **Hacer:** un temporizador por pausa abierta, a su `maxUntil`. Opción a) `resume_billing`: `billing_resumed_at` y `last_heartbeat_at` a `maxUntil`, la PC recibe el `state` con `billing: true` y la sesión vuelve a vigilarse (avisos y agotamiento) aunque siga en pausa. Opción b) `close`: cierra la sesión con motivo `pause_expired`, cobrada hasta el inicio de la pausa. Las dos emiten `session.pause_expired`. Al arrancar el nodo, aplicar con la hora de su `maxUntil` las pausas que vencieron mientras estaba apagado y programar las demás.
  - **Verificar:** e2e con el reloj de pruebas: a) cobra desde `maxUntil` y no antes, y la sesión puede agotarse en pausa; b) cierra y no cobra la pausa; reinicio del nodo con una pausa vencida y otra sin vencer.
  - **Commit:** `feat(server): aplica el límite de duración de la pausa`

- [ ] **T09: Latidos, cortes y reinicios en pausa**
  - **Cubre:** REQ-002-30, REQ-002-31
  - **Hacer:** la revisión de sesiones sin latidos (REQ-001-27) no cierra una sesión en pausa que no cobra; tras vencer con a), la gracia cuenta desde `maxUntil`. Una PC que llega con `hello` sin sesión mientras la suya está en pausa (se reinició o volvió la luz) no la cierra: recibe el `state` con la pausa y vuelve a la pantalla de pausa.
  - **Verificar:** e2e: sin latidos durante 10 min en pausa, la sesión sigue abierta; vencida con a) y sin latidos, se cierra al pasar la gracia y cobra solo hasta el último contacto; `hello` sin sesión con la pausa abierta recibe el `state` con `pause`.
  - **Commit:** `feat(server): mantiene la pausa tras cortes y reinicios`

- [ ] **T10: Reanudar desde el panel y la pausa en el mapa**
  - **Cubre:** REQ-002-13, REQ-002-14, CA-002-08
  - **Hacer:** `POST /sessions/:id/resume` (encargado y administrador): cierra la pausa como `staff_resumed`, con el personal como actor, y la PC recibe su `state` al momento; 404 si no existe, 409 si no está en pausa. El cierre que ya existe (`POST /sessions/:id/close`) sirve para una sesión en pausa. `GET /pcs/map` y el canal del panel llevan `pause` y las pausas usadas.
  - **Verificar:** e2e: reanudar desde el panel (actor, evento, `state` en la PC); el dueño recibe 403; el mapa con la pausa y su `maxUntil`; cerrar una sesión en pausa.
  - **Commit:** `feat(server): reanuda la pausa desde el panel`

## Fase 3: Panel (`apps/panel`)

- [ ] **T11: Diseño de la pausa en el panel**
  - **Cubre:** REQ-002-13, REQ-002-14, CA-002-05, CA-002-08
  - **Hacer:** en el lienzo "Panel Pope · Fase 8": la baldosa en pausa (morado, con el tiempo de pausa que queda) y con borde ámbar cuando ya cobra; la fila "En pausa" de la leyenda; el detalle de la PC en pausa con «Reanudar» y «Cerrar sesión».
  - **Verificar:** aprobación del mantenedor.
  - **Commit:** sin commit (el diseño vive en el lienzo); se anota en `ESTADO.md` con el siguiente commit.

- [ ] **T12: La pausa en el mapa**
  - **Cubre:** REQ-002-14, CA-002-05, CA-002-08
  - **Hacer:** tipo de baldosa `paused` en `map/model.ts`, con el tiempo de pausa restante debajo en lugar del de la sesión, y borde ámbar si `billing`; la leyenda cuenta las PCs en pausa; el restante en vivo no baja durante la pausa, salvo si ya cobra.
  - **Verificar:** tests de `map/model.test.ts`; a mano en Chrome con el simulador.
  - **Commit:** `feat(panel): muestra las PCs en pausa en el mapa`

- [ ] **T13: Detalle de una PC en pausa**
  - **Cubre:** REQ-002-13, CA-002-08
  - **Hacer:** en el detalle de la PC: "En pausa desde 18:05 · quedan 12 min", las pausas usadas en la sesión y hoy, y los botones «Reanudar» (`POST /sessions/:id/resume`) y «Cerrar sesión».
  - **Verificar:** CA-002-08 a mano en Chrome: la PC en pausa en morado con su tiempo, reanudarla desde el detalle y cerrar otra.
  - **Commit:** `feat(panel): reanuda o cierra una sesión en pausa`

## Fase 4: Shell (`apps/shell-ui`)

- [ ] **T14: Diseño de la pausa en el Shell**
  - **Cubre:** REQ-002-01, REQ-002-02, REQ-002-06, REQ-002-10, CA-002-03, CA-002-04, CA-002-06
  - **Hacer:** en el lienzo "Shell Pope · Fase 9": el botón Pausar activo y desactivado con "Sin pausas disponibles" y "Sin pausas disponibles hoy"; la confirmación (aviso de los juegos online y pausas que quedan); la pantalla de pausa con vidrio (tiempo de pausa, pausas que quedan y saldo), y su variante "Tu tiempo vuelve a correr" en ámbar; y "¿Eres juan?" al reanudar.
  - **Verificar:** aprobación del mantenedor.
  - **Commit:** sin commit (el diseño vive en el lienzo); se anota en `ESTADO.md` con el siguiente commit.

- [ ] **T15: Pausa en el canal y en el tiempo en vivo del Shell**
  - **Cubre:** REQ-002-03, REQ-002-06
  - **Hacer:** `PcChannel` envía `pause` y `resume` con `requestId` y espera su respuesta, como `buyCombo`; `session/live.ts` no descuenta durante la pausa (salvo con `billing`) y calcula el tiempo de pausa que queda.
  - **Verificar:** tests de `channel/` y `session/live.test.ts`.
  - **Commit:** `feat(shell-ui): pausa y reanuda por el canal de la PC`

- [ ] **T16: Botón Pausar y confirmación**
  - **Cubre:** REQ-002-01, REQ-002-02, REQ-002-11, REQ-002-23, CA-002-04, CA-002-06, CA-002-07
  - **Hacer:** el botón de la barra (hoy desactivado) se activa en sesiones con cuenta con pausas; si no quedan, desactivado con "Sin pausas disponibles" o "Sin pausas disponibles hoy" según `pauseLimit`; con la pausa desactivada, desactivado y con su mensaje (pregunta 2); no aparece en temporales. La confirmación avisa de que los juegos online pueden desconectarle y dice las pausas que quedan, con «Pausar» y «Seguir jugando»; muestra el texto del nodo si rechaza.
  - **Verificar:** tests de la lógica del botón; a mano en Chrome (CA-002-04, CA-002-06, CA-002-07).
  - **Commit:** `feat(shell-ui): añade el botón Pausar con su confirmación`

- [ ] **T17: Pantalla de pausa y reanudar**
  - **Cubre:** REQ-002-06, REQ-002-10, CA-002-03, CA-002-05
  - **Hacer:** pantalla de pausa según el lienzo: tiempo de pausa que queda (sin segundos, salvo el último minuto), pausas que quedan y saldo; tras vencer con a), "Tu tiempo vuelve a correr" en ámbar y el restante de la sesión bajando. «Reanudar» abre "¿Eres juan?" con «Sí, reanudar» y «Cancelar». Al recargar la página (reinicio de la PC) vuelve a la pausa.
  - **Verificar:** tests de los textos; CA-002-03 a mano en Chrome (cancelar deja la pausa, confirmar reanuda el cobro) y la recarga en pausa.
  - **Commit:** `feat(shell-ui): muestra la pantalla de pausa`

## Fase 5: Simulador (`tools/agent-sim`)

- [ ] **T18: Pausar y reanudar en el simulador**
  - **Cubre:** REQ-002-03, REQ-002-30
  - **Hacer:** órdenes `pausa N` y `reanuda N` en la consola, con su ayuda; la PC simulada deja de contar en local durante la pausa y la muestra en `estado`.
  - **Verificar:** tests de `commands.test.ts` y `simulated-pc.test.ts`; a mano, varias PCs en pausa en el mapa.
  - **Commit:** `feat(tools): pausa y reanuda las PCs simuladas`

## Cierre de la fase 1

- [ ] **T19: Verificación de la fase 1**
  - **Cubre:** CA-002-01, CA-002-03 a CA-002-08
  - **Hacer:** `mediciones.md` de la spec 002 con cada criterio y su test o prueba a mano, como en las specs 001 y 005; la batería con `pnpm test` y `test:pg`. CA-002-02, REQ-002-04, REQ-002-05, REQ-002-07 y REQ-002-50 quedan para la fase 2.
  - **Verificar:** revisión del mantenedor.
  - **Commit:** `docs(specs): verifica la fase 1 de la pausa`

**Orden:** el de arriba. Las fases 3 y 4 empiezan por su diseño (T11, T14), que necesita la
aprobación del mantenedor antes de programar las pantallas.
