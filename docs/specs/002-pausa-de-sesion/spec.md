# Spec 002: Pausa de sesión

- **Estado:** Borrador
- **Fecha:** 2026-09-25
- **ADRs relacionados:** ADR-0007, ADR-0009
- **Specs relacionadas:** 001, 003

## Problema

El cliente a veces necesita levantarse (ir al baño, atender una llamada, comprar algo) y
no quiere pagar ese tiempo. Pero mientras está fuera nadie debe poder usar su PC ni su
saldo, y la pausa no puede usarse para ocupar una PC gratis durante horas.

## Actores

- **Cliente:** pausa y reanuda su sesión.
- **Encargado:** ve las PCs en pausa y puede reanudarlas o cerrarlas.
- **Administrador del local:** configura los límites.
- **Sistema:** aplica los límites.

## Historias de usuario

- Como **cliente**, quiero pausar mi sesión para que no se me descuente tiempo mientras no estoy.
- Como **cliente**, quiero que nadie pueda usar mi PC mientras estoy en pausa.
- Como **administrador**, quiero limitar las pausas para que nadie aparte una PC gratis.

## Requisitos funcionales

**Pausar**
- **REQ-002-01:** El Shell debe ofrecer un botón **Pausar** siempre accesible durante una sesión activa.
- **REQ-002-02:** Antes de pausar, el Shell muestra una confirmación que avisa de que los juegos online pueden desconectarle y cuántas pausas le quedan.
- **REQ-002-03:** El nodo local debe dejar de descontar tiempo **en el instante** en que registra la pausa, según su propio reloj.
- **REQ-002-04:** En pausa, la PC muestra la pantalla de pausa en un escritorio separado (ADR-0009). Ninguna tecla ni clic llega a las aplicaciones del cliente.
- **REQ-002-05:** Las aplicaciones del cliente siguen abiertas durante la pausa; no se cierran ni se suspenden.
- **REQ-002-06:** La pantalla de pausa muestra el tiempo de pausa restante, las pausas que quedan y el saldo, que no cambia.

**Reanudar**
- **REQ-002-10:** Para reanudar, el cliente debe introducir la **contraseña de su cuenta**.
- **REQ-002-11:** En las sesiones temporales sin cuenta (REQ-001-60), el cliente fija un **PIN temporal de 4 dígitos** al pausar, y lo usa para reanudar.
- **REQ-002-12:** Tras 3 intentos fallidos, la reanudación se bloquea 1 minuto y el panel avisa al encargado.
- **REQ-002-13:** El encargado puede reanudar o cerrar una sesión en pausa desde el panel.

**Límites** (configurables por el administrador, iguales para todas las PCs)
- **REQ-002-20:** Duración máxima de cada pausa. Por defecto: 15 min.
- **REQ-002-21:** Número máximo de pausas por sesión. Por defecto: 3.
- **REQ-002-22:** Qué pasa al superar la duración máxima, a elegir entre:
  a) reanudar el cobro manteniendo la PC bloqueada hasta que el cliente vuelva,
  b) cerrar la sesión y liberar la PC,
  c) cobrar una tarifa de "reserva" reducida mientras siga en pausa.
  Por defecto: a).
- **REQ-002-23:** El administrador puede desactivar la pausa por completo en el local.

**Robustez**
- **REQ-002-30:** Si la PC pierde la conexión estando en pausa, sigue bloqueada en pausa. El nodo aplica los límites con su propio reloj.
- **REQ-002-31:** Si se va la luz durante la pausa, al volver la sesión sigue en pausa (o cerrada, si se superó el límite con la opción b).
- **REQ-002-32:** Cada pausa genera los eventos `session.paused`, `session.resumed` y `session.pause_expired`, con actor y hora.

## Requisitos no funcionales

- **REQ-002-50:** Desde que se pulsa **Pausar** hasta que la pantalla de pausa bloquea la entrada pasa < 1 s.
- **REQ-002-51:** La pantalla de pausa consume una CPU mínima: sin animaciones pesadas.

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
  - **Dado** una sesión en pausa
  - **Cuando** otra persona introduce una contraseña incorrecta 3 veces
  - **Entonces** la reanudación queda bloqueada 1 minuto y el panel muestra una alerta.
- **CA-002-04** (REQ-002-21)
  - **Dado** un cliente que ya usó 3 pausas en esta sesión
  - **Entonces** el botón **Pausar** aparece desactivado con el mensaje "Sin pausas disponibles".
- **CA-002-05** (REQ-002-22a)
  - **Dado** un límite de 15 min con la opción a)
  - **Cuando** la pausa llega a 15 min
  - **Entonces** el cobro se reanuda, la PC sigue bloqueada y el panel lo marca.

## Fuera de alcance

- Pausa en consolas.
- Pausas programadas o automáticas por inactividad.

## Preguntas abiertas

- [ ] ¿Límite de pausas **por día** por cuenta, además de por sesión?
- [ ] ¿Se silencia el audio de la PC durante la pausa?
- [ ] ¿Pueden pausar todos los clientes o solo los que tienen cuenta?
- [ ] ¿Debe haber un tiempo mínimo de uso entre dos pausas?
