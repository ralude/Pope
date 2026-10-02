# Spec 002: Pausa de sesión

- **Estado:** Aprobada (mantenedor, 2026-10-02)
- **Fecha:** 2026-09-25
- **ADRs relacionados:** ADR-0007, ADR-0009
- **Specs relacionadas:** 001, 003

## Problema

El cliente a veces necesita levantarse (ir al baño, atender una llamada, comprar algo) y
no quiere pagar ese tiempo. La pausa no puede usarse para ocupar una PC gratis durante
horas.

La pausa **no protege la PC**: se reanuda con un botón, sin contraseña (decisión del
mantenedor, 2026-10-02). Para que no se quite sin querer, el botón pide confirmar con el
nombre del cliente, y el encargado ve en el panel qué PCs están en pausa.

## Actores

- **Cliente:** pausa y reanuda su sesión.
- **Encargado:** ve las PCs en pausa y puede reanudarlas o cerrarlas.
- **Administrador del local:** configura los límites.
- **Sistema:** aplica los límites.

## Historias de usuario

- Como **cliente**, quiero pausar mi sesión para que no se me descuente tiempo mientras no estoy.
- Como **cliente**, quiero que mi pausa no se quite sin querer.
- Como **encargado**, quiero ver qué PCs están en pausa y poder reanudarlas o cerrarlas.
- Como **administrador**, quiero limitar las pausas para que nadie aparte una PC gratis.

## Requisitos funcionales

**Pausar**
- **REQ-002-01:** El Shell debe ofrecer un botón **Pausar** siempre accesible durante una sesión activa con cuenta.
- **REQ-002-02:** Antes de pausar, el Shell muestra una confirmación que avisa de que los juegos online pueden desconectarle y cuántas pausas le quedan.
- **REQ-002-03:** El nodo local debe dejar de descontar tiempo **en el instante** en que registra la pausa, según su propio reloj.
- **REQ-002-04:** En pausa, la PC muestra la pantalla de pausa en un escritorio separado (ADR-0009). Ninguna tecla ni clic llega a las aplicaciones del cliente.
- **REQ-002-05:** Las aplicaciones del cliente siguen abiertas durante la pausa; no se cierran ni se suspenden.
- **REQ-002-06:** La pantalla de pausa muestra el tiempo de pausa restante, las pausas que quedan y el saldo, que no cambia.
- **REQ-002-07:** Durante la pausa la PC se queda en **silencio**; al reanudar vuelve el sonido como estaba (decisión del mantenedor, 2026-10-02).

**Reanudar**
- **REQ-002-10:** Para reanudar, el cliente solo debe quitar la pausa con un botón. El botón pide una confirmación con el nombre de la cuenta ("¿Eres juan? Reanudar") para que no se quite sin querer; no pide contraseña (decisión del mantenedor, 2026-10-02).
- **REQ-002-11:** En las sesiones temporales sin cuenta no se debe pausar.
- **REQ-002-12:** *(Retirado el 2026-10-02: al no pedir contraseña para reanudar, no hay intentos fallidos que limitar.)*
- **REQ-002-13:** El encargado puede reanudar o cerrar una sesión en pausa desde el panel.
- **REQ-002-14:** El mapa del panel muestra las PCs en pausa en **morado**, con el tiempo de pausa que les queda (REQ-003-21; color del mantenedor, 2026-10-02).

**Límites** (configurables por el administrador, iguales para todas las PCs)
- **REQ-002-20:** Duración máxima de cada pausa. Por defecto: 15 min.
- **REQ-002-21:** Número máximo de pausas por sesión. Por defecto: 3.
- **REQ-002-22:** Qué pasa al superar la duración máxima, a elegir entre:
  a) reanudar el cobro manteniendo la PC bloqueada hasta que el cliente vuelva,
  b) cerrar la sesión y liberar la PC.
  Por defecto: a). (La antigua opción c, una "tarifa de reserva", se retiró el 2026-10-02.)
- **REQ-002-23:** El administrador puede desactivar la pausa por completo en el local.
- **REQ-002-24:** Número máximo de pausas **por día** y por cuenta, sumando todas sus sesiones del día (en hora de Caracas). Por defecto: 5. Así, cerrar y volver a entrar no da pausas nuevas sin límite (decisión del mantenedor, 2026-10-02).

**Robustez**
- **REQ-002-30:** Si la PC pierde la conexión estando en pausa, sigue bloqueada en pausa. El nodo aplica los límites con su propio reloj.
- **REQ-002-31:** Si se va la luz durante la pausa, al volver la sesión sigue en pausa (o cerrada, si se superó el límite con la opción b).
- **REQ-002-32:** Cada pausa genera los eventos `session.paused`, `session.resumed` y `session.pause_expired`, con actor y hora.

## Requisitos no funcionales

- **REQ-002-50:** Desde que se pulsa **Pausar** hasta que la pantalla de pausa bloquea la entrada pasa < 1 s.

## Criterios de aceptación

- **CA-002-01** (REQ-002-03)
  - **Dado** una sesión con 60 min de saldo
  - **Cuando** el cliente pausa 10 min y reanuda
  - **Entonces** sigue teniendo 60 min menos el tiempo usado antes de la pausa.
- **CA-002-02** (REQ-002-04)
  - **Dado** un juego a pantalla completa y la sesión en pausa
  - **Cuando** alguien pulsa teclas, Alt+Tab o la tecla Windows
  - **Entonces** el juego no recibe nada y la pantalla de pausa sigue visible.
- **CA-002-03** (REQ-002-10)
  - **Dado** la sesión de juan en pausa
  - **Cuando** alguien pulsa **Reanudar**
  - **Entonces** el Shell pregunta "¿Eres juan?" y el cobro solo se reanuda al confirmar; si cancela, la PC sigue en pausa.
- **CA-002-04** (REQ-002-21)
  - **Dado** un cliente que ya usó 3 pausas en esta sesión
  - **Entonces** el botón **Pausar** aparece desactivado con el mensaje "Sin pausas disponibles".
- **CA-002-05** (REQ-002-22a)
  - **Dado** un límite de 15 min con la opción a)
  - **Cuando** la pausa llega a 15 min
  - **Entonces** el cobro se reanuda, la PC sigue bloqueada y el panel lo marca.
- **CA-002-06** (REQ-002-24)
  - **Dado** que juan ya usó 5 pausas hoy, repartidas en dos sesiones
  - **Cuando** abre una sesión nueva ese mismo día
  - **Entonces** el botón **Pausar** aparece desactivado con el mensaje "Sin pausas disponibles hoy".
- **CA-002-07** (REQ-002-11)
  - **Dado** una sesión temporal abierta por el encargado
  - **Entonces** el Shell no ofrece **Pausar** y el nodo rechaza una petición de pausa.
- **CA-002-08** (REQ-002-14, REQ-002-13)
  - **Dado** la PC 05 en pausa con 12 min de pausa restantes
  - **Entonces** el mapa del panel la pinta en morado con "12 min", y el encargado puede reanudarla o cerrarla desde su detalle.

## Fuera de alcance

- Pausa en consolas.
- Pausas programadas o automáticas por inactividad.
- Proteger la PC en pausa con contraseña o PIN (decisión del mantenedor, 2026-10-02).

## Preguntas abiertas

- [x] ¿Límite de pausas **por día** por cuenta, además de por sesión? **Resuelta (mantenedor, 2026-10-02): sí, por defecto 5** (REQ-002-24).
- [x] ¿Se silencia el audio de la PC durante la pausa? **Resuelta (mantenedor, 2026-10-02): sí** (REQ-002-07).
- [x] ¿Pueden pausar todos los clientes o solo los que tienen cuenta? **Resuelta (mantenedor, 2026-10-02): solo con cuenta**; las temporales no pausan (REQ-002-11).
- [x] ¿Debe haber un tiempo mínimo de uso entre dos pausas? **Resuelta (mantenedor, 2026-10-02): no**; basta con los límites por sesión y por día.
- [x] ¿Cómo se reanuda? **Resuelta (mantenedor, 2026-10-02): con un botón y una confirmación con el nombre de la cuenta, sin contraseña** (REQ-002-10). Se retiran REQ-002-12 y el antiguo CA-002-03 de intentos fallidos.
- [x] ¿Cuánto cuesta la "tarifa de reserva" de la opción c)? **Resuelta (mantenedor, 2026-10-02): se retira la opción c)** (REQ-002-22).
- [x] ¿De qué color va una PC en pausa en el mapa? **Resuelta (mantenedor, 2026-10-02): morado** (REQ-002-14).
