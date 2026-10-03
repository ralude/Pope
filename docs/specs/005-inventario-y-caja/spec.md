# Spec 005: Inventario de productos y caja

- **Estado:** por partes.
  - **Parte 1 · Moneda y tasa de cambio** (REQ-005-30 a REQ-005-36): **Aprobada** (mantenedor, 2026-10-02), con su [plan](plan.md) y [tareas](tasks.md). En pausa tras T04, por decisión del mantenedor, para hacer antes la parte 2.
  - **Parte 2 · Inventario, ventas y caja** (REQ-005-01 a REQ-005-05, REQ-005-10 a REQ-005-25, REQ-005-40 a REQ-005-53): redactada con el mantenedor y **Aprobada** el 2026-10-02, con su plan y sus tareas (también aprobados). **Implementada y verificada** (T24, 2026-10-03). **Cambios del 2026-10-03, aprobados** (mantenedor, 2026-10-03) e implementados (T25 a T31): el «otro ingreso» sustituye a los conceptos (REQ-005-05), la lista de movimientos pasa a ser una tabla como la de SENET con los ingresos del día (REQ-005-24, REQ-005-26) y el informe X (REQ-005-46).
  - **Parte 3 · Conteo físico y pedidos desde el Shell** (REQ-005-50, REQ-005-60, REQ-005-61): borrador.
- **Fecha:** 2026-09-25 · parte 2 redactada el 2026-10-02
- **ADRs relacionados:** ADR-0001, ADR-0004, ADR-0008, ADR-0015
- **Specs relacionadas:** 001, 006

## Problema

El local vende golosinas, bebidas y servicios como impresiones, y necesita saber **cada día**
cuánto hay de cada producto, cuánto se vendió, cuánto dinero debe haber en caja y quién hizo
cada movimiento. En Venezuela se cobra en varias monedas y métodos (efectivo en USD o en
bolívares, pago móvil, punto de venta).

**Cómo se hace hoy** (mantenedor, 2026-10-02): cada venta se anota en SENET **y** en una hoja
de papel. Al final del día el encargado cuadra que los dos registros coincidan con lo vendido
y manda al grupo de WhatsApp el reporte de SENET y una foto de la hoja. Pope sustituye a SENET
en esto: cada venta se anota una vez, y el cierre de caja produce el reporte que se envía. La
hoja de papel se sigue usando de respaldo.

## Actores

- **Encargado:** vende, recibe mercancía, abre y cierra la caja.
- **Administrador del local:** gestiona productos y precios, y anula ventas.
- **Cliente:** paga en el mostrador o con el saldo de su cuenta.
- **Dueño:** revisa ventas, stock y diferencias de caja (en el panel; desde fuera, spec 006).

## Historias de usuario

- Como **encargado**, quiero vender una golosina en dos clics y que el stock baje solo.
- Como **encargado**, quiero cobrar algo que no es golosina ni horas de PC, como unas impresiones, escribiendo el importe y un comentario.
- Como **encargado**, quiero ver en una tabla todo lo que cobré hoy y, en grande, cuánto llevo.
- Como **encargado**, quiero sacar el reporte de la caja a mitad del día sin cerrarla.
- Como **encargado**, quiero cerrar la caja sabiendo si el dinero cuadra y llevarme el reporte para mandarlo al grupo.
- Como **administrador**, quiero dar de alta golosinas con su foto, su precio y la cantidad que llegó.
- Como **dueño**, quiero ver cada cierre de caja con todo su detalle y cualquier diferencia entre lo contado y lo esperado.

## Requisitos funcionales

### Parte 2 · Inventario, ventas y caja

**Productos (golosinas, bebidas…)**
- **REQ-005-01:** Un producto tiene nombre, **foto** (opcional), precio de venta en USD, stock mínimo (opcional) y un indicador de activo. Se mantiene sencillo a propósito (mantenedor, 2026-10-02): sin código de barras, costo ni categorías por ahora.
- **REQ-005-02:** Los cambios de precio quedan registrados con actor y fecha.
- **REQ-005-03:** La foto se sube desde el panel (JPG, PNG o WebP) y se guarda en el nodo local, que la sirve al panel sin internet.
- **REQ-005-04:** El administrador crea y edita productos; el encargado y el dueño los ven.

**Otros ingresos (sin inventario)**
- **REQ-005-05:** Lo que no es golosina ni horas de PC (impresiones, copias, plastificado…) se cobra como **otro ingreso**, como en SENET: el encargado escribe el **importe en USD** y, si quiere, un **comentario** (p. ej. "20 impresiones"). No se configura de antemano ni lleva inventario (mantenedor, 2026-10-03; sustituye a los conceptos configurables que acordamos el 2026-10-02, que se quitan del todo).

**Movimientos de stock**
- **REQ-005-10:** El stock solo cambia mediante movimientos de tipo `entrada`, `venta`, `ajuste` o `merma`. Cada movimiento lleva cantidad, actor, hora y motivo (obligatorio en ajuste y merma). "Cuánto hay" se da de alta con una **entrada**, nunca escribiendo la cantidad.
- **REQ-005-11:** El stock actual de un producto es la suma de sus movimientos.
- **REQ-005-12:** Por defecto, no se puede vender por debajo de 0. El administrador puede permitirlo.
- **REQ-005-13:** Cuando un producto llega a su stock mínimo o baja de él, el panel lo avisa (con mínimo 5, avisa ya con 5; mantenedor, 2026-10-02).
- **REQ-005-14:** El encargado registra entradas de mercancía; el administrador, además, ajustes y mermas.

**Ventas (panel del encargado)**
- **REQ-005-20:** Pantalla de **Caja** como en SENET: a la izquierda, la **venta nueva** (golosinas con su foto, u otro ingreso con su importe y su comentario); a la derecha, la **lista de movimientos** del turno. Una venta puede llevar varios productos y otros ingresos, y pagarse con uno o varios métodos.
- **REQ-005-21:** Métodos de pago: **efectivo USD**, **efectivo Bs**, **pago móvil**, **punto de venta** y **saldo de la cuenta del cliente** (mantenedor, 2026-10-02: el saldo también paga golosinas y otros ingresos). El sistema no verifica pagos externos; los confirma el encargado (la verificación automática del pago móvil es la spec 007).
- **REQ-005-22:** Cada pago registra su **moneda** y, si se paga en bolívares, la **tasa de cambio aplicada** (la vigente, parte 1).
- **REQ-005-23:** Una venta solo la anula un administrador, con motivo. La anulación genera movimientos inversos (stock y caja); nunca se borra nada. Solo se anulan ventas de la caja abierta: un cierre ya hecho no cambia, y un error de un día pasado se corrige con ajustes de stock y de saldo (mantenedor, 2026-10-02).
- **REQ-005-24:** La **lista de movimientos** es una tabla como la de SENET, el más reciente arriba, con las columnas **hora, cliente, estado, descripción, método y total** (mantenedor, 2026-10-03). Muestra todo lo cobrado en el turno: ventas de productos y otros ingresos, recargas de saldo, sesiones temporales y combos vendidos en caja (spec 001) y las anulaciones; la última fila es la **apertura de caja**, con su hora y el fondo inicial. El estado es "Cobrado", "Con saldo", "Anulada", "Anulación" o "Apertura". El total lleva signo (una anulación resta) y, si se cobró en bolívares, también el importe en Bs. Al tocar una fila se ve su detalle: las líneas con su cantidad, el pago, quién lo cobró y, en una anulación, el motivo; ahí está "Anular" para el administrador (REQ-005-23).
- **REQ-005-25:** Una venta pagada con saldo no entra en el dinero de la caja: aparece en la lista y en los reportes marcada "con saldo".
- **REQ-005-26:** Encima de la lista se ven en grande los **ingresos del día**: lo cobrado en la caja abierta, en USD, sin lo pagado con saldo y con las anulaciones restadas (el mismo total del reporte, REQ-005-51). Debajo, lo de cada grupo (horas de PC, golosinas y otras ventas, REQ-005-52) y, aparte, lo pagado con saldo (mantenedor, 2026-10-03).

**Turno de caja** (amplía el turno mínimo de la spec 001)
- **REQ-005-40:** El encargado abre turno declarando el **fondo inicial** en efectivo USD y en efectivo Bs.
- **REQ-005-41:** Todas las ventas, recargas, sesiones temporales y combos cobrados en caja quedan asociados al turno abierto.
- **REQ-005-42:** Al cerrar el turno, el encargado declara lo **contado por método**: efectivo USD, efectivo Bs, pago móvil y punto de venta. El sistema muestra lo esperado (fondo + lo cobrado en ese método) y la **diferencia** (mantenedor, 2026-10-02).
- **REQ-005-43:** No se pueden registrar ventas sin un turno abierto.
- **REQ-005-44:** Se trabaja con **un turno al día**: el reporte del turno es el del día (mantenedor, 2026-10-02). La caja es **del local**: solo hay una abierta, y mientras lo está, encargados y administradores cobran en ella, cada cobro con el nombre de quien lo hizo. La cierra quien la abrió o un administrador. Si se cierra por error, se puede abrir otra el mismo día, con su propio cierre (mantenedor, 2026-10-02).
- **REQ-005-45:** Antes de cerrar, el panel pide confirmación ("¿Seguro que quieres cerrar la caja?"). Al confirmar, el cierre **descarga sí o sí** el reporte del encargado en PDF (REQ-005-51). El botón dice "Cerrar caja (informe Z)", como en SENET (mantenedor, 2026-10-03).
- **REQ-005-46:** Mientras la caja está abierta, quien ve la Caja (encargado, administrador o dueño) puede descargar el **informe X**: el reporte del encargado (REQ-005-51) con lo cobrado hasta ese momento y, por método, solo lo esperado, sin lo contado ni la diferencia. Arriba dice "Informe X · caja abierta" y la hora en que se sacó. No cierra la caja ni cambia nada (mantenedor, 2026-10-03).

**Reportes del cierre**
- **REQ-005-51:** **Reporte del encargado**: PDF plano de **una página** (puede seguir en una segunda si se vendieron muchos artículos distintos), para imprimir o mandar al grupo de WhatsApp. Lleva el **nombre del local** (un ajuste que cambia el administrador desde el panel; mantenedor, 2026-10-02), fecha, encargado, hora de apertura y cierre, lo vendido por grupo (**horas de PC**, **golosinas** y **otras ventas**) y el total, y por método lo esperado, lo contado y la diferencia. Lo pagado con saldo aparece aparte. Al final, **lo vendido por artículo**, como el Z-Report de SENET: cada golosina con la cantidad vendida en el turno (sin las ventas anuladas) y lo que queda en almacén, y los otros ingresos juntos en una línea, "Otros ingresos", con su importe en USD, cuántos se cobraron y "—" en almacén (mantenedor, 2026-10-03).
- **REQ-005-52:** **Horas de PC** reúne las sesiones temporales, las recargas de saldo y los combos vendidos en caja; **golosinas**, los productos del inventario; **otras ventas**, los otros ingresos (mantenedor, 2026-10-02 y 2026-10-03).
- **REQ-005-53:** **Reporte detallado**, para el administrador y el dueño: además de lo del reporte del encargado, cada movimiento del turno (los otros ingresos con su comentario), las anulaciones con su motivo y, por producto, el stock inicial, las entradas, las ventas, los ajustes, las mermas y el stock final. Se descarga en PDF desde el historial de cierres del panel, de cualquier día.

### Parte 1 · Moneda y tasa de cambio (BCV)

- **REQ-005-30:** Todos los precios, tarifas y saldos están en **USD**. Donde se muestre un importe, aparece primero en USD y a su lado el **equivalente en bolívares** a la tasa vigente.
- **REQ-005-31:** El nodo local obtiene automáticamente la **tasa oficial USD → VES del BCV**. El BCV la publica los días hábiles bancarios **por la tarde** (aprox. 16:00–18:00, hora de Caracas), con **fecha valor del siguiente día hábil**.
- **REQ-005-32:** Los días hábiles, el nodo consulta cada 30 min entre las 15:00 y las 20:00 (hora de Caracas) hasta obtener la tasa nueva, y una vez más a las 08:00 por si se publicó tarde. El horario es configurable.
- **REQ-005-33:** Cada tasa se guarda con su fecha valor, su fuente y la hora a la que se obtuvo. La **tasa vigente** de un día es la más reciente cuya fecha valor sea hoy o anterior. Fines de semana y feriados sigue vigente la última.
- **REQ-005-34:** Sin internet o si el BCV no responde, se mantiene la última tasa vigente y el panel muestra su fecha. El **encargado o el administrador** puede introducir la tasa a mano desde el panel; vale **desde el momento en que se guarda** y queda registrada con actor y fuente "manual". El dueño la ve, pero no la cambia. (Quién y desde cuándo: decisión del mantenedor, 2026-10-02.)
- **REQ-005-35:** El panel avisa si la tasa vigente tiene más de 1 día hábil de antigüedad.
- **REQ-005-36:** El panel muestra siempre la tasa vigente, con su fecha y su fuente. Un cambio de tasa llega al momento a las pantallas abiertas del panel y a las PCs con sesión, que pasan a mostrar el equivalente en Bs con la tasa nueva.

### Parte 3 · Conteo físico y pedidos desde el Shell (borrador)

- **REQ-005-50:** El encargado puede hacer un conteo físico, total o por categoría. El sistema compara con el stock calculado y genera los `ajuste` necesarios con motivo "conteo".
- **REQ-005-60:** El cliente puede pedir productos desde el Shell. El pedido llega al panel con aviso sonoro y el número de PC.
- **REQ-005-61:** El pedido se paga con el saldo de la cuenta o en el mostrador. El encargado lo marca como **entregado**, y el stock baja solo en ese momento.

## Requisitos no funcionales

- **REQ-005-70:** Los importes se guardan como enteros en micro-unidades (ADR-0015), con su código de moneda. Nunca como decimales flotantes.
- **REQ-005-71:** Una venta se registra en < 500 ms en el hardware del ADR-0011.
- **REQ-005-72:** Todo funciona sin internet (ADR-0001).
- **REQ-005-73:** Las fotos de los productos no pasan de unos cientos de KB cada una, para no cargar el disco ni la red del nodo (ADR-0011).

## Criterios de aceptación

**Parte 2**
- **CA-005-01** (REQ-005-10, REQ-005-11)
  - **Dado** un producto con 10 unidades
  - **Cuando** se venden 3 y se registra 1 de merma
  - **Entonces** el stock es 6 y existen 2 movimientos con actor y hora.
- **CA-005-02** (REQ-005-22)
  - **Dado** un refresco a 1,00 USD y una tasa de 40 Bs por USD
  - **Cuando** se paga en efectivo en Bs
  - **Entonces** se registran 40,00 Bs con la tasa 40 aplicada.
- **CA-005-03** (REQ-005-42)
  - **Dado** un turno con 50 USD esperados en efectivo
  - **Cuando** el encargado declara 45 USD al cerrar
  - **Entonces** el cierre muestra −5 USD de diferencia y queda en el evento del cierre.
- **CA-005-07** (REQ-005-05, REQ-005-20, REQ-005-24)
  - **Dado** una caja abierta
  - **Cuando** el encargado cobra en efectivo USD un otro ingreso de 1,20 USD con el comentario "12 impresiones"
  - **Entonces** la tabla de movimientos muestra arriba una fila con la hora, "Cobrado", "Otro ingreso · 12 impresiones", "Efectivo USD" y "+1,20 USD", y en su detalle quién lo cobró.
- **CA-005-08** (REQ-005-01, REQ-005-03, REQ-005-10)
  - **Dado** el administrador da de alta "Doritos" con su foto, a 1,50 USD, y registra una entrada de 24 unidades
  - **Entonces** el producto aparece con su foto en la venta nueva con 24 disponibles.
- **CA-005-09** (REQ-005-45, REQ-005-51, REQ-005-52)
  - **Dado** un turno con 10,00 USD en sesiones temporales, 5,00 USD en recargas, 3,00 USD en golosinas y 1,20 USD en un otro ingreso ("12 impresiones")
  - **Cuando** el encargado cierra la caja y confirma
  - **Entonces** se descarga un PDF de una página con horas de PC 15,00 USD, golosinas 3,00 USD, otras ventas 1,20 USD y total 19,20 USD.
- **CA-005-10** (REQ-005-21, REQ-005-25)
  - **Dado** juan con 5,00 USD de saldo
  - **Cuando** paga unas papas de 1,50 USD con su saldo
  - **Entonces** le quedan 3,50 USD, el stock baja y la venta aparece "con saldo" sin sumar al dinero de la caja.
- **CA-005-11** (REQ-005-23)
  - **Dado** una venta de 2 refrescos ya cobrada
  - **Cuando** el administrador la anula con el motivo "error de cobro"
  - **Entonces** el stock vuelve a subir 2, la caja descuenta su importe y la venta y su anulación aparecen en la lista y en el reporte detallado.
- **CA-005-12** (REQ-005-24, REQ-005-26)
  - **Dado** una caja abierta a las 08:02 con 20,00 USD y 500,00 Bs de fondo, una venta de 4,00 USD por pago móvil, otra de 1,50 USD con el saldo de juan y otra de 2,00 USD en efectivo USD que el administrador anuló
  - **Cuando** el encargado mira la Caja
  - **Entonces** los ingresos del día son 4,00 USD; la tabla muestra la anulación con "−2,00 USD", la venta anulada tachada, la de juan "Con saldo" y, al final, la apertura de las 08:02 con su fondo.
- **CA-005-13** (REQ-005-46)
  - **Dado** una caja abierta con 19,20 USD cobrados
  - **Cuando** el encargado pulsa "Informe X"
  - **Entonces** se descarga un PDF que dice "Informe X · caja abierta" con el total de 19,20 USD y lo esperado por método, sin contado ni diferencia, y la caja sigue abierta sin ningún evento nuevo.

**Parte 1**
- **CA-005-04** (REQ-005-31, REQ-005-33)
  - **Dado** que el martes a las 16:30 el BCV publica 41 Bs por USD con fecha valor del miércoles
  - **Cuando** se vende algo el martes a las 17:00
  - **Entonces** se usa la tasa anterior, y desde el miércoles a las 00:00 se usa 41.
- **CA-005-05** (REQ-005-34)
  - **Dado** el local sin internet desde el lunes
  - **Cuando** es miércoles
  - **Entonces** se sigue usando la tasa del lunes, el panel muestra "Tasa del lunes" y avisa de que está desactualizada.
- **CA-005-06** (REQ-005-34, REQ-005-36, REQ-001-13)
  - **Dado** un nodo sin ninguna tasa y un cliente en sesión con 3,00 USD de saldo
  - **Cuando** el encargado escribe en el panel la tasa 40,00 Bs por USD
  - **Entonces** desde ese momento el panel y el Shell muestran "3,00 USD (≈ 120,00 Bs)", y queda un evento con el encargado como actor y la fuente "manual".

## Fuera de alcance

- Facturación fiscal.
- Compras a proveedores con órdenes de compra.
- Recetas o combos que descuenten varios productos.
- Varios almacenes.
- Código de barras, costo y margen de los productos, y categorías (por ahora; REQ-005-01).
- Varios turnos de caja en un mismo día (REQ-005-44).
- **Varias cajas abiertas a la vez**, como en SENET (donde se elige la caja de cada cobro): el mantenedor lo quiere estudiar **después del piloto** (2026-10-03). Hasta entonces, una sola caja del local (REQ-005-44).

## Preguntas abiertas

- [ ] **Fondos agregados y retiradas de efectivo** (como en el Z-Report de SENET): meter o sacar efectivo de la caja a mitad de turno, con motivo, y que cuente en lo esperado del cierre. El mantenedor lo deja para más adelante (2026-10-03).

- [x] ¿Cuál es la moneda base de los precios? **Resuelta: USD, con equivalente en Bs** (REQ-005-30).
- [x] ¿La tasa se introduce a mano o se consulta? **Resuelta: automática desde el BCV, con opción manual** (REQ-005-31 a REQ-005-34).
- [ ] ¿La tasa nueva se aplica **cuando llega su fecha valor** o **en cuanto se publica**? (Propuesta: por fecha valor, que es cuando entra en vigor oficialmente.)
- [x] ¿Qué métodos de pago usa hoy el local? **Resuelta: pago móvil, punto de venta y efectivo** (REQ-005-21).
- [x] ¿Se necesita imprimir tickets? **Resuelta (mantenedor, 2026-10-02): no por venta**; lo que se imprime o se manda al grupo es el reporte del cierre (REQ-005-51).
- [x] ¿Quién introduce la tasa a mano y desde cuándo vale? **Resuelta (mantenedor, 2026-10-02): el encargado o el administrador, y vale desde que se guarda** (REQ-005-34).
- [ ] **Días hábiles (REQ-005-35).** ¿Qué es "más de 1 día hábil" de antigüedad? Propuesta para empezar: de lunes a viernes, sin contar feriados; los feriados bancarios de Venezuela se añadirían con la consulta automática al BCV.
- [x] ¿Qué hay que cuadrar al cerrar? **Resuelta (mantenedor, 2026-10-02): el dinero contado por método contra lo esperado** (REQ-005-42). Hoy se cuadran SENET y la hoja de papel; con Pope hay un solo registro y la hoja queda de respaldo.
- [x] ¿Cómo se venden las impresiones? **Resuelta (mantenedor, 2026-10-02): con conceptos configurables sin inventario.** Cambiada el 2026-10-03: como "otro ingreso", con importe y comentario, como en SENET (REQ-005-05).
- [x] ¿Qué entra en la parte 2 además de productos, ventas y caja? **Resuelta (mantenedor, 2026-10-02): anular ventas, ajustes y mermas, y aviso de stock bajo.** El conteo físico y los pedidos desde el Shell quedan para la parte 3.
