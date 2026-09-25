# Spec 005: Inventario de productos y caja

- **Estado:** Borrador
- **Fecha:** 2026-09-25
- **ADRs relacionados:** ADR-0001, ADR-0004, ADR-0008
- **Specs relacionadas:** 001, 006

## Problema

El local vende snacks y bebidas, y necesita saber **cada día** cuánto hay de cada
producto, cuánto se vendió, cuánto dinero debe haber en caja y quién hizo cada movimiento.
En Venezuela se cobra habitualmente en varias monedas y métodos (efectivo en USD o en
bolívares, pago móvil, transferencia).

## Actores

- **Encargado:** vende, recibe mercancía, cuenta el stock y cierra su turno.
- **Administrador del local:** gestiona productos y precios.
- **Cliente:** pide productos desde el Shell.
- **Dueño:** revisa ventas, stock y diferencias de caja (spec 006).

## Historias de usuario

- Como **encargado**, quiero vender un refresco en dos clics y que el stock baje solo.
- Como **encargado**, quiero registrar la mercancía que llega con su costo.
- Como **dueño**, quiero ver cada cierre de caja y cualquier diferencia entre lo contado y lo esperado.
- Como **cliente**, quiero pedir algo desde mi PC y que me lo traigan.

## Requisitos funcionales

**Productos**
- **REQ-005-01:** Los productos tienen nombre, categoría, código interno, código de barras (opcional), precio de venta, costo, stock mínimo y un indicador de activo.
- **REQ-005-02:** Los cambios de precio quedan registrados con actor y fecha.

**Movimientos de stock**
- **REQ-005-10:** El stock solo cambia mediante movimientos de tipo `entrada`, `venta`, `ajuste` o `merma`. Cada movimiento lleva cantidad, actor, hora y motivo (obligatorio en ajuste y merma).
- **REQ-005-11:** El stock actual de un producto es la suma de sus movimientos.
- **REQ-005-12:** Por defecto, no se puede vender por debajo de 0. El administrador puede permitirlo.
- **REQ-005-13:** Cuando un producto baja de su stock mínimo, se genera una alerta.

**Punto de venta (panel del encargado)**
- **REQ-005-20:** Venta con carrito, lector de código de barras opcional y pago con uno o varios métodos.
- **REQ-005-21:** Métodos de pago configurables: efectivo, pago móvil, transferencia y **saldo de la cuenta del cliente**.
- **REQ-005-22:** Cada pago registra su **moneda** y, si se paga en una moneda distinta de la del precio, la **tasa de cambio aplicada**.
- **REQ-005-23:** Una venta solo la anula un administrador, con motivo. La anulación genera movimientos inversos; nunca se borra nada.

**Tasa de cambio**
- **REQ-005-30:** El administrador registra la tasa del día (p. ej. USD → VES). Queda guardada con fecha y actor, y es la que usan las ventas desde ese momento.

**Turnos de caja**
- **REQ-005-40:** El encargado abre turno declarando el fondo inicial en cada moneda.
- **REQ-005-41:** Todas las ventas y recargas de saldo (REQ-001-03) quedan asociadas al turno abierto.
- **REQ-005-42:** Al cerrar el turno, el encargado declara lo contado por moneda y método. El sistema muestra lo esperado y la **diferencia**.
- **REQ-005-43:** No se pueden registrar ventas sin un turno abierto.

**Inventario al día (conteo físico)**
- **REQ-005-50:** El encargado puede hacer un conteo físico, total o por categoría. El sistema compara con el stock calculado y genera los `ajuste` necesarios con motivo "conteo".
- **REQ-005-51:** El reporte diario muestra, por producto: stock inicial, entradas, ventas, ajustes, mermas y stock final, más el total vendido por moneda.

**Pedidos desde el Shell**
- **REQ-005-60:** El cliente puede pedir productos desde el Shell. El pedido llega al panel con aviso sonoro y el número de PC.
- **REQ-005-61:** El pedido se paga con el saldo de la cuenta o en el mostrador. El encargado lo marca como **entregado**, y el stock baja solo en ese momento.

## Requisitos no funcionales

- **REQ-005-70:** Los importes se guardan como enteros en la unidad mínima, con su código de moneda. Nunca como decimales flotantes.
- **REQ-005-71:** Una venta se registra en < 500 ms en el hardware del ADR-0011.
- **REQ-005-72:** Todo funciona sin internet (ADR-0001).

## Criterios de aceptación

- **CA-005-01** (REQ-005-10, REQ-005-11)
  - **Dado** un producto con 10 unidades
  - **Cuando** se venden 3 y se registra 1 de merma
  - **Entonces** el stock es 6 y existen 2 movimientos con actor y hora.
- **CA-005-02** (REQ-005-22)
  - **Dado** un refresco a 1,00 USD y una tasa de 40 VES/USD
  - **Cuando** se paga en efectivo en VES
  - **Entonces** se registran 40,00 VES con la tasa 40 aplicada.
- **CA-005-03** (REQ-005-42)
  - **Dado** un turno con 50 USD esperados en efectivo
  - **Cuando** el encargado declara 45 USD al cerrar
  - **Entonces** el cierre muestra −5 USD de diferencia y el evento llega a la nube.

## Fuera de alcance

- Facturación fiscal.
- Compras a proveedores con órdenes de compra.
- Recetas o combos que descuenten varios productos.
- Varios almacenes.

## Preguntas abiertas

- [ ] ¿Cuál es la **moneda base** de los precios: USD o VES?
- [ ] ¿La tasa se introduce a mano o se consulta a una fuente (BCV) cuando haya internet?
- [ ] ¿Qué métodos de pago usa hoy el local?
- [ ] ¿Se necesita imprimir tickets?
