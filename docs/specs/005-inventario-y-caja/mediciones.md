# Mediciones de la spec 005

## T24 · Criterios de aceptación de la parte 2 (inventario, ventas y caja)

Cada criterio de la parte 2 con lo que lo comprueba. Los tests se ejecutan con `pnpm test`
(PGlite) y los del servidor también contra PostgreSQL real (`test:pg`). Las rutas son
relativas a `apps/server/src` (servidor), `apps/panel/src` (panel) y `packages/shared/src`
(shared). "A mano" remite a la tarea de `tasks.md` donde se anotó la prueba en Chrome, con la
base de desarrollo.

| CA | Requisitos | Tests | A mano |
|---|---|---|---|
| CA-005-01 | REQ-005-10, 11 | servidor `products/stock.e2e.test.ts` (10, una venta de 3 y una merma de 1 dejan 6, con actor y hora); shared `inventory.test.ts` | T18a (una entrada de 12 y una merma de 1 «bolsa rota»: 24 + 12 − 1 = 35, con sus movimientos) |
| CA-005-02 | REQ-005-22 | servidor `sales/sales.e2e.test.ts` (40,00 Bs con la tasa 40, en la fila y en `sale.recorded`); panel `caja/payment.test.ts`; shared `cash.test.ts`, `events.test.ts` | — |
| CA-005-03 | REQ-005-42 | servidor `shifts/shifts-closing.e2e.test.ts` (−5 USD en el cierre y en `shift.closed` v2); panel `caja/closing.test.ts`; shared `shift.test.ts`, `events.test.ts` | T22b (29,20 USD esperados y 24,20 contados: «-5,00 USD» en el cierre, en «¿Seguro?», en el evento y en el PDF) |
| CA-005-07 | REQ-005-05, 20, 24 | servidor `sales/sales.e2e.test.ts` («Impresiones × 12», 1,20 USD, efectivo USD, con la hora y quién); panel `caja/model.test.ts`, `caja/movements.test.ts`; shared `sale.test.ts` | T19 («Impresiones» a 0,10 USD), T20b (12 impresiones cobradas en efectivo USD) |
| CA-005-08 | REQ-005-01, 03, 10 | servidor `products/products.e2e.test.ts` (alta con la entrada de 24), `products/product-photos.e2e.test.ts` (foto); shared `inventory.test.ts` | T18b («Chocolate Savoy» a 1,50 USD con 24 que llegaron y su foto, reducida a WebP de 512×320 y 16 KB, en la venta nueva con 24 disponibles) |
| CA-005-09 | REQ-005-45, 51, 52 | servidor `cash/shift-report.e2e.test.ts` (horas de PC 15,00, golosinas 3,00, otras ventas 1,20, total 19,20, en una página, con lo vendido por artículo); shared `cash.test.ts` | T22b (cierre con descarga del PDF, de una página), T22c (muestras del reporte con los artículos del Z-Report de SENET) |
| CA-005-10 | REQ-005-21, 25 | servidor `sales/sales.e2e.test.ts` (5,00 − 1,50 = 3,50 de saldo, baja el stock, «con saldo» y fuera de la caja); panel `caja/payment.test.ts`, `caja/movements.test.ts`; shared `cash.test.ts`, `sale.test.ts` | T20b (`maria` con 12,40 USD paga unos Doritos de 1,50 con su saldo: le quedan 10,90 y la fila va con saldo) |
| CA-005-11 | REQ-005-23 | servidor `sales/void-sale.e2e.test.ts` (vuelve el stock, la caja descuenta, la venta y la anulación en la lista; no se anula dos veces ni de una caja cerrada); panel `caja/movements.test.ts`; shared `cash.test.ts`, `shift.test.ts` | T21 (2 Doritos anulados con «error de cobro»: fila de −3,00 USD con el motivo, venta tachada, stock de vuelta) |

Todos los criterios de la parte 2 quedan cubiertos por al menos un test automático y por una
prueba a mano en el panel, salvo CA-005-02, que solo tiene tests: las ventas probadas a mano se
cobraron en USD y con saldo.

**Resultado de la batería** (2026-10-03, equipo de desarrollo): `pnpm test` en verde (shared
233, servidor 332, panel 99, Shell 39, simulador 42). Contra PostgreSQL real, 331 de 332: falla
solo `sessions/no-heartbeat.e2e.test.ts` › «si la PC nunca supo de la sesión…», el test
inestable de la spec 001 ya anotado en `ESTADO.md` y que no toca esta spec.

## Pendiente

- **Imprimir el PDF del encargado en papel** (T22b, REQ-005-51): se comprobó que se descarga y
  que ocupa una página, pero no se imprimió. Lo hace el mantenedor con la impresora del local.
- **REQ-005-71** (una venta en menos de 500 ms en el hardware del ADR-0011): sin medir. Hay que
  repetirlo en el i5 de 2ª generación con 8 GB, junto a las mediciones de la spec 001.
- **Fondos agregados y retiradas de efectivo**: pregunta abierta de la spec (el mantenedor la
  dejó para más adelante, 2026-10-03).
