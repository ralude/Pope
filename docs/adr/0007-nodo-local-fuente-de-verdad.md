# ADR-0007: El nodo local es la fuente de verdad del tiempo y el saldo

- **Estado:** Aceptado
- **Fecha:** 2026-09-25
- **Relacionado:** ADR-0001, ADR-0008, spec 001, spec 002

## Contexto

Si la PC cliente calculara el tiempo consumido, bastaría con cambiar su reloj, matar un
proceso o desconectar el cable de red para no pagar. Además, los cortes de luz en
Venezuela apagan PCs a mitad de sesión.

## Decisión

- El **nodo local** calcula el tiempo cobrado a partir de los eventos de la sesión
  (`iniciada`, `pausada`, `reanudada`, `finalizada`) usando **su** reloj.
- El agente de la PC solo recibe órdenes y el tiempo restante, que muestra como cuenta
  atrás. También envía un **latido** periódico al nodo local.
- **Sin conexión con el nodo local**, el agente sigue contando con el último saldo
  conocido y bloquea la PC si se agota. Al reconectar, el nodo concilia usando sus
  propios registros; el conteo del agente solo sirve de referencia.
- **Si la PC deja de dar señales** (corte de luz, cuelgue), el nodo cierra la sesión
  tras un tiempo de gracia configurable y **cobra solo hasta el último latido
  recibido**, no hasta la hora del cierre.

## Alternativas consideradas

- **Contar en la PC y reportar al final:** trivial de manipular.
- **Bloquear la PC en cuanto se pierde la conexión:** un fallo del switch dejaría a
  todos los clientes sin sesión. Se prefiere seguir con el saldo conocido.

## Consecuencias

- ✅ Cambiar el reloj de la PC o matar procesos no evita el cobro.
- ✅ El cliente no paga el tiempo de un apagón.
- ⚠️ El nodo local debe tener la hora bien sincronizada (NTP cuando haya internet).
- ⚠️ Con la red caída, el cliente puede usar como máximo su saldo conocido; no hay
  pérdida para el local.
