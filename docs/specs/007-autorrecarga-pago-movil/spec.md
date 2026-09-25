# Spec 007: Autorrecarga desde el Shell con verificación de pago móvil

- **Estado:** Borrador (funcionalidad futura; no bloquea el MVP)
- **Fecha:** 2026-09-25
- **ADRs relacionados:** ADR-0001, ADR-0007
- **Specs relacionadas:** 001, 005

## Problema

Hoy el cobro va por fuera del sistema: el cliente paga por pago móvil, punto de venta o
efectivo, el encargado lo comprueba a mano y luego recarga desde su PC. Cuando un cliente
se queda sin tiempo tiene que ir al mostrador y esperar esa comprobación. Si hay mucha
gente, el encargado se convierte en un cuello de botella.

## Actores

- **Cliente:** paga por pago móvil y se recarga solo desde el Shell.
- **Encargado:** supervisa las recargas automáticas y resuelve las que fallan.
- **Sistema:** verifica el pago con el banco y acredita el saldo.

## Historias de usuario

- Como **cliente**, quiero recargar desde mi PC con un pago móvil y seguir jugando sin ir al mostrador.
- Como **dueño**, quiero que ninguna recarga se acredite sin un pago real verificado.

## Flujo propuesto

1. El cliente elige en el Shell una recarga: por importe con la tarifa normal, o un
   **combo** del local.
2. El Shell muestra los datos de pago móvil del comercio (banco, teléfono, RIF) y el
   importe en **bolívares** a la tasa BCV vigente (REQ-005-30).
3. El cliente paga desde su teléfono e introduce en el Shell la **referencia** y su
   teléfono o banco de origen.
4. El nodo local consulta al banco si ese pago existe y si el importe coincide.
5. Si se confirma, acredita el saldo. Si no, avisa al cliente y deja la recarga
   "pendiente de revisión" para el encargado.

## Requisitos funcionales (borrador)

- **REQ-007-01:** Cada referencia de pago se puede usar **una sola vez**.
- **REQ-007-02:** Solo se acredita si el importe recibido en Bs coincide con el esperado a la tasa vigente (con una tolerancia configurable).
- **REQ-007-03:** Cada recarga automática genera un evento con la referencia, el importe en Bs, la tasa y el resultado, visible para el encargado y el dueño.
- **REQ-007-04:** Si no hay internet o el banco no responde, la recarga queda pendiente y el encargado puede aprobarla o rechazarla a mano.

## Fuera de alcance (por ahora)

- Otros métodos de pago automáticos (tarjeta, pasarelas internacionales).

## Preguntas abiertas

- [ ] ¿En qué **banco** está la cuenta del comercio? ¿Ofrece una **API de consulta de pagos móviles recibidos** para comercios? Sin eso no se puede verificar de forma automática y fiable.
- [x] ¿Cómo funcionan los combos? **Resuelta en la spec 001** (REQ-001-80 a 89): el cliente podrá elegir cualquier combo activo al autorrecargarse.
- [ ] ¿Qué tolerancia se acepta si el cliente paga unos céntimos de menos o de más?
- [ ] ¿Límite de recargas automáticas por cliente o por día, como medida antifraude?
