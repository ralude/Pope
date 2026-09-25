# ADR-0015: Importes en micro-unidades enteras

- **Estado:** Aceptado
- **Fecha:** 2026-09-25
- **Relacionado:** ADR-0014, spec 001 (REQ-001-23), spec 005 (REQ-005-70)

## Contexto

El tiempo se cobra **por segundo** (REQ-001-23). A 1,50 USD/h, un segundo cuesta
0,000416… USD, mucho menos que un céntimo. Si el saldo se guardara en céntimos, cada
cobro parcial se redondearía y, sumando miles de latidos, el saldo acabaría desviándose.
Al mismo tiempo, está prohibido usar decimales flotantes para dinero (AGENTS.md).

## Decisión

- Todo importe se guarda como **entero en micro-unidades** de su moneda (6 decimales):
  `1 USD = 1 000 000 µUSD`, e igual para VES. Siempre acompañado de su código de moneda.
- Las tarifas se guardan en **µUSD por hora** (1,50 USD/h = `1 500 000`).
- El tiempo se guarda en **segundos enteros**.
- **Cobro acumulado sin deriva:** en una sesión, el importe cobrado se recalcula siempre
  sobre el total de segundos, `cobrado = floor(segundos × tarifa / 3600)`. Cada cobro
  parcial es la diferencia con el total anterior. Así el error total de una sesión es
  menor que 1 µUSD, dure lo que dure.
- En PostgreSQL se usa `bigint`. En TypeScript se usa `number` entero, validado con
  `Number.isSafeInteger`: el máximo seguro equivale a ~9 000 millones de USD.
- Solo se redondea a céntimos **al mostrar** y cuando se registra un pago real en caja.

## Alternativas consideradas

- **Céntimos:** cómodos, pero no sirven para el cobro por segundo.
- **`numeric` de PostgreSQL + librería decimal en TS:** exacto, pero añade dependencia y
  conversiones en cada capa, y es fácil que alguien mezcle un `number` flotante.
- **`BigInt` de JavaScript:** innecesario con este rango y molesto de serializar a JSON.

## Consecuencias

- ✅ El saldo cuadra al micro-dólar tras cualquier número de sesiones.
- ✅ Un solo tipo de importe en todo el sistema.
- ⚠️ Al aceptarse, hay que actualizar AGENTS.md ("unidad mínima") y REQ-005-70 para que
  digan micro-unidades.
- ⚠️ Toda la interfaz debe pasar por una función común de formato (`formatMoney`) para
  no mostrar nunca micro-unidades crudas.
