# Mediciones de la spec 005

## T24 · Criterios de aceptación de la parte 2 (inventario, ventas y caja)

Cada criterio de la parte 2 con lo que lo comprueba. Los tests se ejecutan con `pnpm test`
(PGlite) y los del servidor también contra PostgreSQL real (`test:pg`). Las rutas son
relativas a `apps/server/src` (servidor), `apps/panel/src` (panel) y `packages/shared/src`
(shared). "A mano" remite a la tarea de `tasks.md` donde se anotó la prueba en Chrome, con la
base de desarrollo. Rehecha el 2026-10-03 tras los cambios de ese día (T25 a T31: otro ingreso,
tabla de movimientos e informe X), con el CA-005-07 nuevo y los CA-005-12 y CA-005-13.

| CA | Requisitos | Tests | A mano |
|---|---|---|---|
| CA-005-01 | REQ-005-10, 11 | servidor `products/stock.e2e.test.ts` (10, una venta de 3 y una merma de 1 dejan 6, con actor y hora); shared `inventory.test.ts` | T18a (una entrada de 12 y una merma de 1 «bolsa rota»: 24 + 12 − 1 = 35, con sus movimientos) |
| CA-005-02 | REQ-005-22 | servidor `sales/sales.e2e.test.ts` (40,00 Bs con la tasa 40, en la fila y en `sale.recorded`); panel `caja/payment.test.ts`; shared `cash.test.ts`, `events.test.ts` | T24 (con la tasa a 40, un «Refresco» de 1,00 USD en efectivo Bs: «Se cobran 40,00 Bs a 40,00 Bs por USD»; la fila guarda 40,00 Bs, 1,00 USD y la tasa 40, y `sale.recorded` lleva el mismo pago) |
| CA-005-03 | REQ-005-42 | servidor `shifts/shifts-closing.e2e.test.ts` (−5 USD en el cierre y en `shift.closed` v2); panel `caja/closing.test.ts`; shared `shift.test.ts`, `events.test.ts` | T22b (29,20 USD esperados y 24,20 contados: «-5,00 USD» en el cierre, en «¿Seguro?», en el evento y en el PDF) |
| CA-005-07 | REQ-005-05, 20, 24 | servidor `sales/sales.e2e.test.ts` (otro ingreso de 1,20 USD con «12 impresiones» en efectivo USD: la fila, la línea guardada con su comentario y `sale.recorded` v2; comentario opcional y con tope; ya no se venden conceptos), `db/migrations.test.ts` (las líneas de concepto pasan a otros ingresos); panel `caja/model.test.ts`, `caja/movements.test.ts` («Cobrado · Otro ingreso · 12 impresiones · Efectivo USD · +1,20 USD»); shared `sale.test.ts`, `events.test.ts` | T27 (1,20 USD con «12 impresiones» en efectivo USD: fila «Otro ingreso · 12 impresiones · Efectivo USD · 1,20 USD», otras ventas a 1,20 y `sale.recorded` v2), T31 (la misma fila en la tabla, «Cobrado» y «+1,20 USD») |
| CA-005-08 | REQ-005-01, 03, 10 | servidor `products/products.e2e.test.ts` (alta con la entrada de 24), `products/product-photos.e2e.test.ts` (foto); shared `inventory.test.ts` | T18b («Chocolate Savoy» a 1,50 USD con 24 que llegaron y su foto, reducida a WebP de 512×320 y 16 KB, en la venta nueva con 24 disponibles) |
| CA-005-09 | REQ-005-45, 51, 52 | servidor `cash/shift-report.e2e.test.ts` (horas de PC 15,00, golosinas 3,00, otras ventas 1,20 con un otro ingreso, total 19,20, en una página, con lo vendido por artículo y «Otros ingresos · 1,20 USD»; los otros ingresos juntos, con cuántos y sin los anulados); shared `cash.test.ts` | T22b (cierre con descarga del PDF, de una página), T22c (muestras del reporte con los artículos del Z-Report de SENET) |
| CA-005-10 | REQ-005-21, 25 | servidor `sales/sales.e2e.test.ts` (5,00 − 1,50 = 3,50 de saldo, baja el stock, «con saldo» y fuera de la caja); panel `caja/payment.test.ts`, `caja/movements.test.ts`; shared `cash.test.ts`, `sale.test.ts` | T20b (`maria` con 12,40 USD paga unos Doritos de 1,50 con su saldo: le quedan 10,90 y la fila va con saldo) |
| CA-005-11 | REQ-005-23 | servidor `sales/void-sale.e2e.test.ts` (vuelve el stock, la caja descuenta, la venta y la anulación en la lista; no se anula dos veces ni de una caja cerrada); panel `caja/movements.test.ts`; shared `cash.test.ts`, `shift.test.ts` | T21 (2 Doritos anulados con «error de cobro»: fila de −3,00 USD con el motivo, venta tachada, stock de vuelta), T31 (2 refrescos anulados: «Anulación» a −2,00 USD con el motivo en su detalle y la venta «Anulada» tachada) |
| CA-005-12 | REQ-005-24, 26 | servidor `cash/cash-register.e2e.test.ts` (cliente y líneas de cada movimiento, también tras el relleno de la migración 0023; quién abrió, cuándo y con qué fondo); panel `caja/movements.test.ts` (estado, cliente, signo, Bs, detalle y fila de apertura); shared `cash.test.ts` (los totales sin el saldo y con las anulaciones restadas) | T31 (caja con 20,00 USD y 500,00 Bs de fondo; 4,00 USD por pago móvil, 1,50 con el saldo de juan y 2,00 en efectivo USD anulados: ingresos del día 4,00 USD, la anulación a −2,00 USD, la venta tachada, la de juan «Con saldo» y la apertura al final) |
| CA-005-13 | REQ-005-46 | servidor `cash/shift-report.e2e.test.ts` («Informe X · caja abierta», total 19,20 USD y lo esperado, sin contado ni diferencia; sin eventos nuevos y con la caja abierta; los cuatro roles; 404 sin caja) | T31 (el informe X responde `application/pdf` desde el panel; una muestra a ojo, de una página, con «Sacado a las…» y solo «Fondo» y «Esperado» por método) |

Todos los criterios de la parte 2 quedan cubiertos por al menos un test automático y por una
prueba a mano en el panel.

**Resultado de la batería** (2026-10-03, equipo de desarrollo, tras T31): `pnpm test` en verde
(shared 237, servidor 337, panel 102, Shell 39, simulador 42). Contra PostgreSQL real, 336 de
337: falla solo `sessions/no-heartbeat.e2e.test.ts` › «si la PC nunca supo de la sesión…», el
test inestable de la spec 001 ya anotado en `ESTADO.md` y que no toca esta spec.

## Pendiente

- **Imprimir el PDF del encargado en papel** (T22b, REQ-005-51): se comprobó que se descarga y
  que ocupa una página, pero no se imprimió. Lo hace el mantenedor con la impresora del local.
- **REQ-005-71** (una venta en menos de 500 ms en el hardware del ADR-0016): sin medir. Hay que
  medirlo en el i3-2120 con 8 GB del local, junto a las mediciones de la spec 001.
- **Fondos agregados y retiradas de efectivo**: pregunta abierta de la spec (el mantenedor la
  dejó para más adelante, 2026-10-03).
