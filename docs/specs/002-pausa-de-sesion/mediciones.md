# Verificación de la spec 002 · Fase 1

## T19 · Criterios de aceptación

Verificación del 2026-10-04 en el equipo de desarrollo. Esta fase cubre el nodo, los
contratos TypeScript, el panel, el Shell de desarrollo y el simulador. El bloqueo real de
Windows, el audio y la latencia de bloqueo pertenecen a la fase 2, junto con la spec 003.

Las rutas de tests son relativas a `apps/server/src` (servidor), `apps/panel/src` (panel),
`apps/shell-ui/src` (Shell), `packages/shared/src` (shared) y `tools/agent-sim/src` (simulador).
Las pruebas anteriores remiten a lo registrado en [`tasks.md`](tasks.md); las de T18/T19
se realizaron con el navegador de Codex, el nodo real sobre PostgreSQL temporal y la
consola compilada del simulador. El mapa se revisó a 1920×1080, resolución de referencia.

| Criterio | Requisitos | Pruebas automáticas | Prueba a mano |
|---|---|---|---|
| CA-002-01 | REQ-002-03 | servidor `sessions/pause.e2e.test.ts`: 60 min iniciales, 20 de uso y 10 de pausa dejan 40; latidos, compra de combo y cambio de tasa no cobran la pausa. Shell `session/live.test.ts`: tiempo y saldo detenidos. Simulador `simulated-pc.test.ts`: diez minutos de pausa conservan el restante y cada latido lo comunica intacto | T18: PC 01 detuvo su restante en 1:29:30; lo conservó varios minutos y durante un corte de red de 20 s; al recibir la reanudación volvió a correr |
| CA-002-03 | REQ-002-10 | servidor `sessions/pause.e2e.test.ts`: reanudar termina la pausa y vuelve a cobrar. Shell `session/pause.test.ts`: respuestas a `resume`; la confirmación se verifica en la pantalla | T17 (Chrome) y T19: «Reanudar» abre «¿Eres sim04?»; «Cancelar» conserva la pantalla y el saldo de 2,95 USD; tras recuperar la conexión, «Sí, reanudar» vuelve a la sesión con ese saldo |
| CA-002-04 | REQ-002-21 | servidor `sessions/pause-limits.e2e.test.ts`: tres pausas dejan `pausesLeft: 0`, límite `session` y la cuarta se rechaza. Shell `session/pause.test.ts`: botón desactivado con «Sin pausas disponibles». Shared `pause.test.ts`: límite por sesión | T16: botón desactivado con ese mensaje al alcanzar el límite configurado. El caso exacto de tres pausas se comprueba en el test e2e |
| CA-002-05 | REQ-002-22a | servidor `sessions/pause-expiry.e2e.test.ts`: a los 15 min se reanuda el cobro desde `maxUntil`, sigue la pausa y se emite el evento; cinco minutos adicionales se cobran. Panel `map/model.test.ts`: pausa vencida. Shell `session/live.test.ts`: vuelve a contar con `billing: true`. Simulador `simulated-pc.test.ts`: cuenta solo tras la orden del nodo | T17: Shell con pausa máxima de 1 min, «Tu tiempo vuelve a correr» y restante ámbar. T19: PCs 02 y 03 vencieron tras los 15 min reales; siguieron moradas con borde ámbar, leyenda «En pausa, ya cobra · 2» y detalle «Ya cobra: el tiempo corre aunque la PC siga en pausa» |
| CA-002-06 | REQ-002-24 | servidor `sessions/pause-limits.e2e.test.ts`: cinco pausas en dos sesiones dejan la tercera sin pausas ese día; vuelven a medianoche de Caracas. Shared `pause.test.ts`: conteo por día. Shell `session/pause.test.ts`: botón desactivado y «Sin pausas disponibles hoy» | El caso exacto de cinco pausas en dos sesiones se verifica automáticamente; no se presenta como prueba manual |
| CA-002-07 | REQ-002-11 | servidor `sessions/pause.e2e.test.ts`: una temporal recibe `pause_unavailable`. Shared `pause.test.ts`: rechazo de temporales. Shell `session/pause.test.ts`: no aparece el botón Pausar | El rechazo y la ausencia del botón se verifican automáticamente |
| CA-002-08 | REQ-002-13, REQ-002-14 | servidor `sessions/pause-panel.e2e.test.ts`: mapa con PC 05 y 12 min de pausa; reanudación del encargado, actor y estado enviados a la PC; cierre de la pausa con la sesión; permisos por rol. Panel `map/model.test.ts`: baldosa, tiempo, leyenda y detalle | T13: reanudar PC 02 y cerrar PC 03 desde el panel. T18: tres PCs moradas y leyenda «En pausa · 3». T19: «Reanudar» cambió PC 02 a «Con cuenta» y «Cerrar sesión», confirmado en el diálogo, dejó PC 03 «Libre» |

Todos los criterios de la fase 1 tienen una comprobación automática; CA-002-03 requiere
además la prueba de la confirmación en la interfaz, realizada en T17 y repetida en T19.
La parte de CA-002-05 que exige bloquear la entrada del sistema queda para la fase 2.

## Robustez, ajustes y auditoría

| Requisitos | Evidencia |
|---|---|
| REQ-002-20 a REQ-002-24 | `settings.test.ts`, `pause.test.ts`, servidor `settings/settings.e2e.test.ts`, `sessions/pause-limits.e2e.test.ts` y `sessions/pause-expiry.e2e.test.ts`: valores predeterminados, límites, desactivación, ambas opciones al vencer y cambio de día de Caracas |
| REQ-002-30, REQ-002-31 | servidor `sessions/pause-connection.e2e.test.ts`: sin latidos durante diez minutos y reinicio de la PC en pausa; `sessions/pause-expiry.e2e.test.ts`: arranque con pausas vencidas y sin vencer. Simulador `simulated-pc.test.ts`: corte mayor que la pausa máxima sin decidir el cobro, reconexión con el restante detenido y descarte de mensajes de la conexión vieja. T18: corte de red de 20 s y reconexión en pausa; T19: recuperación de la pantalla de pausa del Shell |
| REQ-002-32 | `events.test.ts`, servidor `sessions/pause.e2e.test.ts`, `sessions/pause-expiry.e2e.test.ts` y `sessions/pause-panel.e2e.test.ts`: eventos de pausa, reanudación y vencimiento con actor, sesión, PC, hora y segundos no cobrados |

## Batería y entorno

`pnpm format`, `pnpm lint`, `pnpm typecheck` y `pnpm build` terminaron correctamente.
La compilación conserva el aviso de Vite por el tamaño del bundle del panel; no es un
error de compilación ni una medición del rendimiento del nodo local.

`pnpm test -- --force` repitió la batería completa sin caché: **852 tests en verde**:

| Paquete | Tests |
|---|---:|
| shared | 270 |
| servidor (PGlite) | 372 |
| panel | 110 |
| Shell | 52 |
| simulador | 48 |

**PostgreSQL real:** **372 de 372 tests en verde**, en 53 archivos. Tras la corrección de
T51a, se ejecutó la misma batería de `test:pg` con un límite de dos procesos mediante
`TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres pnpm --filter @pope/server
exec vitest run --maxWorkers=2`. Duración: 238,23 s. El log de «oyente roto» corresponde
al test que comprueba que un fallo de un oyente no deshace eventos ya confirmados.

Se utilizó una instancia temporal en `127.0.0.1:55432`, con bases desechables por test y
una base separada para las pruebas del panel y del Shell. La primera ejecución de
`test:pg` tuvo 47 fallos: el test previo de `no-heartbeat` y tiempos agotados al crear o
borrar bases, con checkpoints de más de 30 s. El test previo se corrigió en T51a de la
spec 001, autorizado por el mantenedor, y sus diez casos pasan con ambos motores.
Se interrumpió otra ejecución coincidente con PGlite por presión de memoria.
La verificación final de PostgreSQL se realizó con dos procesos y `fsync=off` solo en
la instancia desechable. Comprueba comportamiento, SQL y transacciones; no demuestra
durabilidad ante cortes de luz ni rendimiento del servidor del local.

## Aprobación y fase 2

- **Revisión del mantenedor (2026-10-04):** T19 y el cierre de la fase 1 aprobados
  expresamente. La aprobación cubre esta verificación; la fase 2 sigue pendiente.
- **CA-002-02, REQ-002-04 y REQ-002-05:** escritorio separado que impide que teclas y clics
  lleguen a las aplicaciones, que siguen abiertas. Dependen de la spec 003 y ADR-0009.
- **REQ-002-07:** silenciar el audio y restaurarlo al reanudar, en el cliente Windows.
- **REQ-002-50:** medir menos de un segundo hasta bloquear la entrada, en una PC del local.
- **Ajustes en el panel:** sigue abierta la pregunta 4 de `tasks.md`; los ajustes de pausa
  se administran por la API según el plan aprobado.
- **Preparación del simulador con caja cerrada:** `seed` intenta abrir caja sin fondos y
  recibe «Datos no válidos». Para estas pruebas se abrió la caja desde el panel. Anotado
  en `ESTADO.md`; requiere su propia tarea y no altera los resultados de la pausa.
