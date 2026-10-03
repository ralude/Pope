# Tareas 005: Inventario y caja

- **Parte 1 · Tasa de cambio manual:** Aprobado (2026-10-02). En pausa tras T03.
- **Parte 2 · Inventario, ventas y caja:** Aprobado (2026-10-02).
- **Plan:** [plan.md](plan.md)

Reglas: una tarea = un commit. Marca `[x]` en el mismo commit que la implementa. Cada
commit deja el repo compilando y con `pnpm test` en verde. Los tests nombran el REQ que
prueban. Si una tarea resulta más grande de lo previsto (> 400 líneas), divídela aquí
antes de seguir.

## Parte 1 · Tasa de cambio manual

### Fase 1: Tasa manual

- [x] **T01: Contratos de la tasa**
  - **Cubre:** REQ-005-33, REQ-005-35, REQ-005-36
  - **Hacer:** en `@pope/shared`, los esquemas de la tasa (respuesta de `GET`, cuerpo de `POST`), el evento `exchange_rate.set`, el mensaje `exchangeRate` del canal del panel, y las funciones puras `currentRate` (vigente entre varias) y `businessDaysOld` (antigüedad de lunes a viernes, en hora de Caracas).
  - **Verificar:** tests unitarios de la tasa vigente y de los días hábiles con un fin de semana por medio.
  - **Commit:** `feat(shared): añade los contratos de la tasa de cambio`
  - **Decidido al implementarla:** módulo `exchange-rate.ts`. La tasa vigente exige además haberse guardado antes del instante consultado: así "vale desde que se guarda" queda en la propia regla. La fecha valor es `AAAA-MM-DD` en hora de Caracas (`localDateInCaracas`). Tope de 10.000.000 Bs por USD. `setBy` es el nombre de quien la escribió, o `null` si viene del BCV. El mensaje del canal del panel es `{ type: 'exchangeRate', rate, stale }`, como dice el plan.

- [x] **T02: Guardar y consultar la tasa en el nodo**
  - **Cubre:** REQ-005-33, REQ-005-34
  - **Hacer:** tabla `exchange_rates` con su migración, `ExchangeRatesService` (vigente en memoria, guardar con evento dentro de `inTransaction`) y `GET`/`POST /exchange-rate` (`POST` solo encargado y administrador).
  - **Verificar:** e2e: el dueño no puede guardar; una tasa válida queda vigente al momento con su evento (actor y fuente `manual`); valores fuera de rango se rechazan.
  - **Commit:** `feat(server): guarda la tasa de cambio manual`
  - **Decidido al implementarla:** módulo `exchange-rates` con migración `0015_exchange_rates`. El servicio guarda en memoria las 20 tasas más recientes (al arrancar las lee de la base) y responde la vigente sin consultar la base; la memoria solo cambia tras confirmar la transacción. `POST` responde 201 con el estado nuevo (tasa y `stale`), igual que `GET`. `setBy` sale del actor del evento. Verificado: 7 tests e2e, también contra PostgreSQL real (roles, validación, evento, sustitución con historia, CA-005-05 y lectura al reiniciar).

- [x] **T03: Repartir la tasa a las PCs y al panel**
  - **Cubre:** REQ-005-36, REQ-001-13
  - **Hacer:** el `state` de las PCs lleva la tasa vigente; al cambiarla, el nodo reenvía el `state` a las PCs con sesión. El canal del panel envía `exchangeRate` al conectar, al cambiar la tasa y al cambiar de día.
  - **Verificar:** e2e: una PC con sesión recibe un `state` con la tasa nueva y el panel el mensaje `exchangeRate`.
  - **Commit:** `feat(server): reparte la tasa de cambio a las PCs y al panel`
  - **Decidido al implementarla:** `ExchangeRatesService` avisa a quien se suscriba al guardar una tasa. `SessionsService` pone la vigente en todo `state` activo (`stateOf`) y, al cambiar, reenvía a cada PC conectada con sesión su `state` cobrado hasta ahora, como en un latido, para que el Shell no dé un salto atrás. `PanelHub` manda `exchangeRate` al conectar, al cambiar la tasa y en la revisión de cada minuto si cambió (así detecta el paso de día). Antes, `refactor(server)`: el cliente de prueba del canal del panel pasa a `testing/`. Verificado: 5 tests e2e nuevos (sesión con cuenta y temporal, reenvío, panel al conectar y al cambiar, desactualizada al pasar los días), también contra PostgreSQL real.

- [x] **T04: La tasa en el panel**
  - **Cubre:** REQ-005-34, REQ-005-35, REQ-005-36
  - **Hacer:** píldora de la tasa en la barra superior (vigente, sin tasa o desactualizada) y diálogo "Tasa del día" para el encargado y el administrador. Lectura del valor escrito a µVES.
  - **Verificar:** tests de la lectura del valor; a mano, guardar una tasa y verla en dos pestañas del panel a la vez.
  - **Commit:** `feat(panel): muestra y permite cambiar la tasa de cambio`
  - **Decidido al implementarla:** píldora `RatePill` junto a la hora de la barra superior: «Tasa · 1 USD = 40,50 Bs», o en ámbar «Sin tasa» y «Tasa del lunes» (día de la semana de la fecha valor); el texto de ayuda dice la fuente, quién la guardó y cuándo, en hora de Caracas. Para el encargado y el administrador abre «Tasa del día» (la vigente, el campo «Bs por 1 USD» con vista previa y «Guardar»); para el dueño está desactivada. La lectura del valor (`parseVesRate`) admite coma o punto y hasta 6 decimales, como `parseUsd`, y no admite separador de miles. La tasa llega por el canal del panel (`usePcMapFeed().rate`) y la comparten todas las pantallas. Verificado a mano en Chrome: con dos pestañas abiertas, guardar 40,50 cambió la píldora en las dos al momento, y quedó el evento `exchange_rate.set` con el administrador como actor y fuente `manual`. Al probarlo salieron dos fallos que se arreglan en commits aparte: los diálogos de la barra superior quedaban tapados por la sección (`fix(panel)`: `z-index` en `.dialog-backdrop`) y Vite escuchaba solo en IPv6 y no reenviaba la API de la spec 005 (`fix(panel)`).

- [ ] **T05: Bs en el mapa, Clientes y cobros**
  - **Cubre:** REQ-005-30, REQ-001-13
  - **Hacer:** equivalente en Bs, debajo del importe en USD, en el detalle de la PC del mapa, Clientes, Recargar saldo y Vender combo.
  - **Verificar:** a mano, con tasa y sin tasa.
  - **Commit:** `feat(panel): muestra el equivalente en Bs en el mapa y los cobros`

- [ ] **T06: Bs en tarifas, combos y sesiones temporales**
  - **Cubre:** REQ-005-30, REQ-001-13
  - **Hacer:** equivalente en Bs en Tarifas, Combos (precio y precio por hora) y en el diálogo de sesión temporal.
  - **Verificar:** a mano, con tasa y sin tasa.
  - **Commit:** `feat(panel): muestra el equivalente en Bs en tarifas, combos y temporales`

### Cierre de la parte 1

- [ ] **T07: Verificación de la parte 1**
  - **Cubre:** CA-005-06, REQ-001-13
  - **Hacer:** probar CA-005-06 en Chrome (panel y Shell). Marcar REQ-001-13 como hecho en la spec 001 y anotar la verificación en `mediciones.md` de la spec 001.
  - **Verificar:** revisión del mantenedor.
  - **Commit:** `docs(specs): verifica la tasa de cambio manual`

## Parte 2 · Inventario, ventas y caja

**Orden** (plan, "Orden de implementación"): T08 a T17 (T13a, la caja del local, antes del registro de caja); después **T04** de la parte 1 (la tasa
en el panel, necesaria para cobrar en bolívares); después T18 a T24 (con T23b); y al final T05 a T07 de la
parte 1.

### Fase 1: Diseño y contratos

- [x] **T08: Diseño de Caja, Inventario y cierre**
  - **Cubre:** REQ-005-20, REQ-005-24, REQ-005-45, REQ-005-51
  - **Hacer:** artboards nuevos en el lienzo "Panel Pope · Fase 8": Caja (venta nueva a la izquierda, movimientos a la derecha), Inventario (página propia con buscador, productos con foto, modal "Nuevo producto" y conceptos), abrir turno con fondo, cerrar con conteo y confirmación, Cierres, y una maqueta del PDF de una página.
  - **Verificar:** aprobación del mantenedor.
  - **Commit:** sin commit (el diseño vive en el lienzo); se anota en ESTADO.md con el siguiente commit.
  - **Decidido al implementarla:** artboards Caja, Inventario, NuevoProducto, AbrirCaja, CerrarCaja (conteo, confirmación y "Caja cerrada"), Cierres y ReportePDF (A4). El raíl gana Caja, Inventario y Cierres; "Turno de caja" pasa a ser Caja. El PDF del encargado no lleva líneas de firma (mantenedor). Aprobado por el mantenedor el 2026-10-02.

- [x] **T09a: Contratos del inventario**
  - **Cubre:** REQ-005-01 a REQ-005-05, REQ-005-10 a REQ-005-14
  - **Hacer:** en `@pope/shared`, los esquemas de productos (con la cantidad inicial como primera entrada), conceptos y movimientos de stock; el ajuste `allowNegativeStock` (REQ-005-12); los eventos `product.*`, `stock.moved` y `sale_concept.*`; el aviso de bajo mínimo.
  - **Verificar:** tests unitarios de los esquemas, del bajo mínimo y de los eventos.
  - **Commit:** `feat(shared): añade los contratos del inventario`
  - **Decidido al implementarla:** módulo `inventory.ts`. Los tipos de movimiento van en inglés como el resto de los datos: `restock` (entrada), `sale` (venta), `adjustment` (ajuste) y `waste` (merma). `POST /products` lleva `initialQuantity` (0 si no llegó nada) y el nodo la guarda como entrada en la misma transacción. La foto se identifica con `photoVersion`, que entra en la ruta (`productPhotoPath`) para que la caché larga no enseñe una foto vieja. Bajo mínimo era estar **por debajo** del mínimo; después (T18, mantenedor) pasó a ser **llegar** al mínimo, como en el diseño. Evento nuevo `product.photo_set`. `stock.moved` solo para entradas, ajustes y mermas (con la cantidad con signo); lo de las ventas va en sus eventos. `allowNegativeStock` es 0 o 1, como número igual que los demás ajustes.

- [x] **T09b: Contratos de las ventas y el registro de caja**
  - **Cubre:** REQ-005-20 a REQ-005-25, REQ-005-52
  - **Hacer:** en `@pope/shared`, los esquemas de ventas (líneas y pagos, con el método "saldo"), el registro y la lista de caja del turno, y el mensaje `cash` del canal; el tipo de movimiento `sale` del monedero; los eventos `sale.recorded` y `sale.voided`; funciones puras: importe en Bs con la tasa, reparto de los pagos por grupo y totales por grupo.
  - **Verificar:** tests unitarios de las funciones y de los esquemas (incluidos CA-005-02 y los totales de CA-005-09).
  - **Commit:** `feat(shared): añade los contratos de las ventas y el registro de caja`
  - **Decidido al implementarla:** módulos `cash.ts` (registro de caja) y `sale.ts` (venta). El método "saldo" es `balance`, añadido a los cuatro de la caja en `cashMethodSchema`; `methodCurrency` dice en qué moneda se cobra y se cuenta cada uno. Los pagos de `POST /sales` van por su importe en USD y el nodo pone la tasa vigente; que sumen el total lo comprueba el nodo. `splitPayments` reparte los pagos entre los grupos en orden y calcula el Bs una vez por pago (la última fila se queda el resto, para no perder un céntimo). `cashTotals` deja lo pagado con saldo aparte, fuera de los grupos y del total (REQ-005-25). La lista del turno (`GET /shifts/current/entries`) devuelve movimientos ya juntados, con su descripción escrita por el nodo (que también escribe el PDF) y los totales. `sale.voided` lleva el turno al que va la fila negativa.

- [x] **T09c: Contratos de la apertura y el cierre del turno**
  - **Cubre:** REQ-005-40, REQ-005-42, REQ-005-44
  - **Hacer:** en `@pope/shared`, los esquemas del fondo inicial, lo esperado y lo contado al cerrar y el historial de cierres; la versión 2 de `shift.opened` y `shift.closed`; funciones puras: lo esperado por método y la diferencia.
  - **Verificar:** tests unitarios (incluido CA-005-03) y que los eventos de versión 1 siguen siendo válidos.
  - **Commit:** `feat(shared): añade los contratos de la apertura y el cierre del turno`
  - **Decidido al implementarla:** en `shift.ts`. El fondo (`openingCashSchema`) es el cuerpo de `POST /shifts`. Lo esperado, lo contado y la diferencia van por método (`cashByMethodSchema`, con los cuatro métodos de la caja y ninguno más), cada uno en la moneda en que se cuenta. `expectedCash` deja fuera lo pagado con saldo y los cobros antiguos de un método de Bs guardados en USD. El historial y la respuesta del cierre usan `shiftSummarySchema`. En la unión de eventos, cada tipo con dos versiones es una unión por `version`; la versión 1 sigue siendo válida.

### Fase 2: Nodo

- [x] **T10: Productos y conceptos**
  - **Cubre:** REQ-005-01, REQ-005-02, REQ-005-04, REQ-005-05
  - **Hacer:** tablas `products` y `sale_concepts` con su migración; alta y edición (solo administrador) con eventos, incluido el precio anterior y el nuevo.
  - **Verificar:** e2e por rol y eventos.
  - **Commit:** `feat(server): da de alta productos y conceptos de venta`
  - **Decidido al implementarla:** módulos `products` (productos) y `sales` (por ahora, los conceptos). La tabla `stock_movements` entra ya aquí, porque el alta escribe lo que llegó como primera entrada en la misma transacción, con su `stock.moved`; T12 añade los endpoints de movimientos. `GET /products` ya devuelve el stock (suma de movimientos) y el aviso de bajo mínimo. Las listas van primero con los activos y por nombre. Migración `0016_products`. Verificado: 10 tests e2e (roles, eventos, precio anterior y nuevo, CA-005-08 sin la foto).

- [x] **T11: Fotos de los productos**
  - **Cubre:** REQ-005-03, REQ-005-73
  - **Hacer:** `POPE_DATA_DIR` (documentado en AGENTS.md), `PUT /products/:id/photo` con cuerpo `image/webp` hasta 512 KB y `GET` con caché larga.
  - **Verificar:** e2e: subir, servir, rechazar otro tipo o más de 512 KB, y que el dueño no pueda subir.
  - **Commit:** `feat(server): guarda las fotos de los productos`
  - **Decidido al implementarla:** `POPE_DATA_DIR` (por defecto `apps/server/data/`, en `.gitignore`); el parser de `image/webp` va en `bootstrap.ts` con el tope de 512 KB (413 si se pasa; 415 si es otro tipo). El nodo comprueba además la cabecera RIFF/WEBP. El archivo se llama `<id>-<12 hex del sha256>.webp` y esa parte es la `photoVersion`; se escribe aparte y se renombra, y la foto anterior se borra del disco. Subir la misma foto no emite otro evento. `GET /products/:id/photo` exige sesión del personal (como toda la API) y responde con `Cache-Control: private, max-age=31536000, immutable`. Los tests usan una carpeta de datos temporal por app. Verificado: 6 tests e2e.

- [x] **T12: Movimientos de stock**
  - **Cubre:** REQ-005-10 a REQ-005-14
  - **Hacer:** tabla `stock_movements`; entradas (encargado y administrador), ajustes y mermas con motivo (administrador); stock calculado y aviso de bajo mínimo en `GET /products`.
  - **Verificar:** e2e: CA-005-01 (con la venta simulada por movimiento) y CA-005-08 sin la foto.
  - **Commit:** `feat(server): registra el stock con movimientos`
  - **Decidido al implementarla:** `StockService` en el módulo `products`. `POST /products/:id/stock` admite encargado y administrador, y el servicio responde 403 si el encargado pide un ajuste o una merma. Ningún movimiento deja el stock en negativo salvo con `allowNegativeStock` (409 "No hay tanto stock de…"), no solo las ventas: no se puede mermar lo que no hay. El producto se bloquea (`for update`) mientras se calcula el stock. Endpoint nuevo `GET /products/:id/movements` (los 50 últimos, el más reciente arriba, con el nombre de quien lo hizo), para el detalle del diseño de Inventario. Verificado: 5 tests e2e (CA-005-01 con la venta simulada, roles, bajo mínimo, stock negativo y validación).

- [x] **T13a: Caja del local**
  - **Cubre:** REQ-005-44
  - **Hacer:** el turno pasa a ser del local: uno solo abierto (índice único parcial; la migración cierra los que sobren), encargados y administradores cobran en él, `GET /shifts/current` devuelve la caja abierta y `@RequiresOpenShift()` exige la del local.
  - **Verificar:** e2e: un segundo turno se rechaza aunque lo pida otra persona; el administrador cobra en la caja que abrió la encargada; los e2e de la spec 001 siguen pasando.
  - **Commit:** `feat(server): hace la caja de turno única en el local`
  - **Decidido al implementarla:** `ShiftsService.findOpen()` ya no recibe a nadie: devuelve la caja abierta del local, y la usan `OpenShiftGuard`, `GET /shifts/current` y la venta de combos en caja. Mensajes nuevos: "Ya hay una caja abierta" (409), "No hay una caja abierta" (409) y "Solo quien abrió la caja o un administrador puede cerrarla" (403). El índice `cash_shifts_one_open_idx` es único sobre `(closed_at is null)` solo para las abiertas. La migración `0017_one_open_cash_shift` cierra antes las cajas abiertas de más (todas menos la más reciente), que solo existen en bases de desarrollo. Dos e2e de la spec 001 (temporales) suponían que el administrador necesitaba su propio turno: ahora cobra en la caja de Ana. Verificado: e2e del turno reescritos (segunda caja rechazada aunque la pida otra persona, quién cierra, reabrir el mismo día, el administrador cobra en la caja de la encargada).

- [x] **T13b: Eventos de los cobros en caja con el pago en Bs**
  - **Cubre:** REQ-005-22
  - **Hacer:** en `@pope/shared`, versión 2 de `wallet.recharged`, `session.started`, `session.time_added` y `combo.purchased` con el pago completo (método, moneda, importe, equivalente en USD y tasa), como `sale.recorded` (mantenedor, 2026-10-02). La versión 1 sigue siendo válida.
  - **Verificar:** tests de los esquemas (un pago en Bs exige su tasa; la versión 1 sigue valiendo).
  - **Commit:** `feat(shared): añade el pago en Bs a los eventos de los cobros en caja`
  - **Decidido al implementarla:** decidido con el mantenedor antes de programar el registro de caja: los eventos de los cobros de la spec 001 llevan también el pago en Bs. Esquema común `cashDeskPaymentSchema` (método de la caja, importe con su moneda, equivalente en USD y tasa; un pago en Bs exige tasa y uno en USD no la lleva). En la versión 2, `paymentMethod` se sustituye por `payment`; en `combo.purchased`, dentro de `payment.via = cash_desk`. Cada tipo con dos versiones es una unión por `version`. El nodo sigue emitiendo la versión 1 hasta T13c.

- [x] **T13c: Registro de caja**
  - **Cubre:** REQ-005-24, REQ-005-41
  - **Hacer:** tabla `cash_entries` con migración que pasa los cobros anteriores; recargas, sesiones temporales (abrir y añadir tiempo) y combos en caja escriben su fila en la misma transacción y emiten sus eventos en versión 2, en Bs con la tasa vigente si el método es de Bs (sin tasa, solo efectivo USD); `GET /shifts/current/entries`; mensaje `cash` del canal del panel.
  - **Verificar:** los e2e de la spec 001 siguen pasando; e2e nuevos de las filas de cada cobro y de la lista del turno.
  - **Commit:** `feat(server): anota todos los cobros en el registro de caja`
  - **Decidido al implementarla:** módulo `cash` con `CashRegisterService.record(tx, cobro)` (usa `splitPayments` con la tasa vigente; sin tasa y con un método de Bs responde 409 "No hay tasa de cambio: cobra en efectivo USD o escribe la tasa del día", dentro de la transacción del cobro, así que no queda nada a medias). La tabla guarda una copia de la descripción ("Recarga · juan", "Sesión temporal · PC 05 · Carlos", "Más tiempo · PC 05 · Carlos", "Combo 20 horas · juan"); la columna del grupo se llama `report_group` porque `group` es palabra reservada. `sourceId` es la fila del ledger (recargas y combos) o la del cobro de la temporal. El ledger acepta un id dado (`LedgerEntry.id`) para enlazarlo. La migración `0018_cash_entries` pasa los cobros anteriores (en USD, sin tasa, con el id de su origen); un test vuelve a ejecutar sus INSERT y comprueba que dan las mismas filas que escribe el nodo. Los cobros emiten ya la versión 2 de sus eventos (las sesiones con cuenta siguen en la versión 1 de `session.started`, que no cambia). `PanelHub` manda `cash` tras los eventos de cobros, ventas, stock, productos, conceptos y caja. `GET /shifts/current/entries` es para todo el personal; sin caja abierta, 409. Cinco e2e de la spec 001 cobraban en Bs sin tasa: ahora guardan antes la tasa y esperan el evento v2.

- [x] **T14: Ventas**
  - **Cubre:** REQ-005-20 a REQ-005-22, REQ-005-25, REQ-005-43
  - **Hacer:** tablas `sales` y `sale_lines`; `POST /sales` con productos y conceptos, uno o varios pagos, Bs con la tasa vigente y pago con saldo (ledger `sale`); baja el stock (sin pasar de 0, salvo con `allowNegativeStock`); turno abierto obligatorio.
  - **Verificar:** e2e: CA-005-02, CA-005-07, CA-005-10, venta sin stock rechazada, sin tasa no se cobra en Bs, sin turno no se vende.
  - **Commit:** `feat(server): registra ventas de productos y conceptos`
  - **Decidido al implementarla:** `SalesService` en el módulo `sales`. Todo en una transacción: venta, líneas (con la copia del nombre y del precio; el de los productos lo pone el nodo y el de los conceptos lo escribe el encargado), movimientos de stock `sale`, cargo al saldo (movimiento `sale` del ledger, que gana la columna `sale_id`), registro de caja y `sale.recorded`. Los productos se bloquean en orden de id mientras se comprueba el stock; varias líneas del mismo producto suman. Mensajes: "No hay suficiente Refresco: quedan 10" (409, salvo con `allowNegativeStock`), "Refresco ya no está a la venta" (409), "Los pagos no suman el total de la venta" (400), "Saldo insuficiente" (409, con el saldo en vivo: lo consumido por la sesión en curso no se puede gastar, `WalletService.liveMoney`) y "La cuenta está bloqueada: no puede pagar con su saldo". La descripción es "Papas × 2, Impresiones × 10". `POST /sales` responde el movimiento tal como sale en la lista de la caja. Migración `0019_sales`. El e2e de CA-005-01 de T12 pasa a usar una venta de verdad. Verificado: 7 tests e2e (CA-005-02, CA-005-07, CA-005-10, reparto por grupo con dos pagos, stock, cobros rechazados y sin caja).

- [x] **T15: Anular una venta**
  - **Cubre:** REQ-005-23
  - **Hacer:** `POST /sales/:id/void` (solo administrador, con motivo): marca la venta, devuelve el stock, escribe la fila negativa del registro de caja y devuelve el saldo si se pagó con él.
  - **Verificar:** e2e: CA-005-11 y que no se puede anular dos veces.
  - **Commit:** `feat(server): permite anular una venta`
  - **Decidido al implementarla:** `SalesService.void` en una transacción: bloquea la venta y su caja (la caja no puede cerrarse a la vez), marca `voided_at`, `void_reason` y `voided_by`, devuelve el stock con movimientos `sale` positivos que apuntan a la venta, devuelve al saldo lo cobrado de él (otro movimiento `sale` del ledger) y escribe en el registro de caja una fila negativa por cada fila de la venta (`CashRegisterService.reverseSale`), con el mismo método, moneda y **la misma tasa** de la venta, para devolver justo lo cobrado aunque la tasa haya cambiado. Mensajes: "Esa venta ya está anulada" y "Solo se anulan ventas de la caja abierta" (409). La lista de la caja marca la venta como anulada y lleva el motivo en la fila de la anulación ("Anulación · Refresco × 2"). `POST /sales/:id/void` responde esa fila. Verificado: 5 tests e2e (CA-005-11, Bs con otra tasa, saldo, dos veces/sin motivo/rol, caja cerrada).

- [x] **T16a: Caja con fondo y cierre con conteo**
  - **Cubre:** REQ-005-40, REQ-005-42, REQ-005-44
  - **Hacer:** columnas nuevas de `cash_shifts`; abrir con el fondo; `GET /shifts/current/closing` y cerrar con lo contado (quien abrió o un administrador), guardando lo esperado; eventos versión 2; `GET /shifts` para el historial.
  - **Verificar:** e2e: CA-005-03, quién puede cerrar, historial por rol.
  - **Commit:** `feat(server): abre la caja con fondo y la cierra con conteo`
  - **Decidido al implementarla:** `cash_shifts` gana el fondo (`opening_cash_usd_micros`, `opening_cash_ves_micros`, 0 en las cajas antiguas), `expected`, `counted` (jsonb por método) y `closed_by`; migración `0020_cash_shift_counts`. Por decisión del mantenedor, el nodo exige ya el fondo al abrir y lo contado al cerrar (400 sin ellos), aunque el panel no los envía hasta T22: hasta entonces, abrir y cerrar la caja desde el panel da error. Lo esperado se calcula con `expectedCash` sobre el registro de caja (sin depender del módulo `cash`, para no crear un ciclo con `ShiftsModule`, que es global). Al cerrar se guardan lo esperado y lo contado; la diferencia se calcula al leer. `shift.opened` y `shift.closed` se emiten en la versión 2. `POST /shifts/current/close` responde el cierre (`ShiftSummary`). `GET /shifts` (administrador y dueño) da todas las cajas, la más reciente arriba, con quien la abrió, los totales y, si está cerrada, lo esperado, lo contado y la diferencia. Los tests que no miran importes usan `NO_OPENING_CASH` y `NOTHING_COUNTED` (`testing/shifts.ts`). Verificado: 8 tests e2e nuevos (fondo y evento, CA-005-03, lo esperado en Bs, validación, historial por rol).

- [x] **T16b: Nombre del local**
  - **Cubre:** REQ-005-51
  - **Hacer:** ajuste de texto `localName` (por defecto "Pope") en `@pope/shared` y en el nodo; versión 2 de `setting.changed`, con valores de número o de texto.
  - **Verificar:** tests de los esquemas y e2e de los ajustes (el administrador lo cambia y queda el evento v2).
  - **Commit:** `feat(server): guarda el nombre del local como ajuste`
  - **Decidido al implementarla:** ajuste `localName` (de 1 a 60 caracteres, sin espacios al principio ni al final, por defecto "Pope"). `setting.changed` versión 2 con `from` y `to` de número o de texto; el nodo emite ya la v2 para todos los ajustes. `SettingsService.get` valida cada ajuste guardado por separado (si uno no vale, usa su valor por defecto) y luego el conjunto con su esquema. Sin migración: los ajustes sin fila valen su valor por defecto. Verificado: tests de los esquemas y e2e del ajuste (evento v2, rechazo del nombre vacío).

- [x] **T17: Reportes PDF**
  - **Cubre:** REQ-005-51, REQ-005-52, REQ-005-53
  - **Hacer:** `pdfkit` (justificado en el plan); `GET /shifts/:id/report.pdf` con el resumen de una página y el detallado (`?full=1`), con sus roles.
  - **Verificar:** e2e: CA-005-09 (el texto del PDF lleva los totales y tiene una página), el detallado con movimientos y stock, y el encargado no descarga el detallado.
  - **Commit:** `feat(server): genera los reportes del cierre en PDF`
  - **Decidido al implementarla:** `pdfkit` 0.20 (y `@types/pdfkit`) en el servidor. `ShiftReportService` reúne los datos (resumen de la caja, quién la abrió y la cerró, última tasa con que se cobró en Bs, movimientos en orden de hora y el stock de cada producto activo o movido: inicial, entradas, ventas ya descontadas las anulaciones, ajustes, mermas y final). `report-pdf.ts` lo dibuja en A4 con Helvetica, sin colores y **sin comprimir** (es pequeño y así los tests leen su texto con `testing/pdf-text.ts`). El resumen solo lleva totales y el cuadre por método (fondo, esperado, contado y diferencia, cada uno en la moneda del método con `formatVes` o `formatMoney`), así que cabe siempre en una página; el detallado añade movimientos, anulaciones con su motivo y stock, en las páginas que hagan falta. Las horas van en hora de Caracas. `GET /shifts/:id/report.pdf` (`?full=1` el detallado) se descarga como `cierre-caja-AAAA-MM-DD.pdf`; el encargado solo el resumen de las cajas que abrió o cerró. Antes, `feat(shared)`: `formatVes`. Verificado: 3 tests e2e (CA-005-09 con una página, detallado con anulación y stock, permisos) y toda la batería contra PostgreSQL real (330 de 331; falla solo `no-heartbeat`, el inestable ya anotado).

### Fase 3: Panel

- [x] **T18a: Inventario en el panel: lista y stock**
  - **Cubre:** REQ-005-04, REQ-005-10, REQ-005-13, REQ-005-14
  - **Hacer:** página `/inventario` según el diseño: productos con su foto y buscador por nombre; estado (bien, bajo mínimo, agotado); detalle con los últimos movimientos; entrada (encargado y administrador), ajuste y merma (administrador); se refresca con el mensaje `cash` del canal.
  - **Verificar:** tests de la lógica (estado, búsqueda, lectura de cantidades); a mano en Chrome, una entrada y una merma.
  - **Commit:** `feat(panel): muestra el inventario y sus movimientos de stock`
  - **Decidido al implementarla:** página `/inventario` (raíl: Inventario tras Clientes) con buscador sin mayúsculas ni tildes, tabla con foto o iniciales, precio con su Bs si hay tasa, stock, mínimo y estado (Desactivado, Agotado si es 0 o menos, Bajo mínimo según el nodo, Bien), y a la derecha el producto elegido con sus 50 últimos movimientos («Venta anulada» para una venta que vuelve). `StockDialog` para entrada (encargado y administrador, nota opcional), ajuste (con signo, «-2») y merma (administrador, con motivo), con «Quedará». El canal del panel lleva `cashVersion`, que sube con cada mensaje `cash`: Inventario vuelve a pedir la lista y los movimientos cuando cambia. El dueño ve todo sin botones; el encargado ve Ajuste y Merma desactivados («Solo el administrador»), como en el diseño. Verificado en Chrome: dos productos de prueba creados desde la sesión del administrador aparecieron solos en la lista; Pepito (5 de mínimo 5) sale «Bajo mínimo»; una entrada de 12 y una merma de 1 («bolsa rota») dejaron Doritos en 35 con sus tres movimientos; el buscador filtra.

- [x] **T18b: Inventario en el panel: alta y edición con foto**
  - **Cubre:** REQ-005-01, REQ-005-03, REQ-005-04, REQ-005-10
  - **Hacer:** modal "Nuevo producto" (nombre, foto reducida con `<canvas>` a WebP antes de subirla, precio, stock mínimo, cantidad que llegó, que se guarda como entrada, y activo) y el mismo modal para editar.
  - **Verificar:** tests del tamaño de la foto; CA-005-08 a mano en Chrome.
  - **Commit:** `feat(panel): da de alta y edita productos con foto`
  - **Decidido al implementarla:** `ProductDialog` (alta y edición, solo administrador; el encargado ve «Editar» desactivado): foto, nombre, precio con su Bs, stock mínimo opcional («Avisa al llegar a esta cantidad»), cantidad que llegó (solo al dar de alta; vacía es 0) y «Activo». La foto se reduce en el navegador (`shrinkPhoto`: `createImageBitmap` y `<canvas>`, lado mayor de 512 px, WebP probando calidades 0,85 a 0,4 hasta caber en 512 KB) y se sube después de guardar el producto con `ApiClient.upload` (PUT con el archivo tal cual). Si la foto falla tras el alta, el modal se queda con el producto ya guardado y dice que vuelvas a guardar para reintentar solo la foto. `ProductPhoto` pasa a su propio archivo. Verificado en Chrome (CA-005-08): «Chocolate Savoy» a 1,50 USD con 24 que llegaron y una foto JPG de 1,35 MB quedó en la lista con su foto y 24 disponibles; en el nodo, WebP de 512×320 y 16 KB; «Editar» cambió el precio a 1,75 conservando la foto.

- [ ] **T19: Conceptos en el panel**
  - **Cubre:** REQ-005-05
  - **Hacer:** pestaña de conceptos en Inventario (alta y edición para el administrador).
  - **Verificar:** a mano, crear "Impresiones" a 0,10 USD.
  - **Commit:** `feat(panel): gestiona los conceptos de venta`

- [ ] **T20: Caja: venta nueva**
  - **Cubre:** REQ-005-20 a REQ-005-22, REQ-005-25
  - **Hacer:** pantalla `/caja`, mitad izquierda: golosinas y otras ventas, carrito, pagos (varios métodos, Bs con la tasa, saldo de una cuenta).
  - **Verificar:** tests del carrito y del reparto de pagos; a mano CA-005-07 y CA-005-10.
  - **Commit:** `feat(panel): vende golosinas y conceptos desde la caja`

- [ ] **T21: Caja: movimientos del turno**
  - **Cubre:** REQ-005-23, REQ-005-24
  - **Hacer:** mitad derecha de `/caja`: lista en vivo (mensaje `cash`), totales por grupo y "Anular" para el administrador.
  - **Verificar:** a mano: una recarga desde Clientes y una venta aparecen en la lista; CA-005-11.
  - **Commit:** `feat(panel): muestra los movimientos del turno en la caja`

- [ ] **T22: Abrir y cerrar la caja**
  - **Cubre:** REQ-005-40, REQ-005-42, REQ-005-45
  - **Hacer:** abrir turno con fondo; cerrar con lo esperado, lo contado, la diferencia, "¿Seguro que quieres cerrar la caja?" y la descarga del PDF.
  - **Verificar:** a mano CA-005-03 y CA-005-09, con el PDF impreso en una página.
  - **Commit:** `feat(panel): abre y cierra la caja con su reporte`

- [ ] **T23: Historial de cierres**
  - **Cubre:** REQ-005-53
  - **Hacer:** pantalla `/cierres` para el administrador y el dueño, con los totales de cada día y los dos PDF.
  - **Verificar:** a mano, por rol.
  - **Commit:** `feat(panel): muestra el historial de cierres`

- [ ] **T23b: Ajustes del local en el panel**
  - **Cubre:** REQ-005-12, REQ-005-51
  - **Hacer:** pantalla de ajustes para el administrador con el nombre del local y "Permitir vender sin stock" (el panel aún no tenía pantalla de ajustes).
  - **Verificar:** a mano, cambiar los dos y verlos en el PDF y en la Caja.
  - **Commit:** `feat(panel): permite cambiar los ajustes del local`

### Cierre de la parte 2

- [ ] **T24: Verificación de la parte 2**
  - **Cubre:** CA-005-01 a CA-005-03, CA-005-07 a CA-005-11
  - **Hacer:** tabla en `mediciones.md` de la spec 005 con cada criterio y su test o prueba a mano, como en la spec 001.
  - **Verificar:** revisión del mantenedor.
  - **Commit:** `docs(specs): verifica el inventario y la caja de la spec 005`
