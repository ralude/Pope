# Plan 005: Inventario y caja

- **Spec:** [spec.md](spec.md)
- **Parte 1 · Tasa de cambio manual:** Aprobado (2026-10-02). En pausa tras T03.
- **Parte 2 · Inventario, ventas y caja:** Aprobado (2026-10-02).
- **ADRs que aplican:** ADR-0001 (local-first), ADR-0007 (el nodo decide), ADR-0008 (eventos),
  ADR-0011 (recursos), ADR-0015 (micro-unidades).
- **ADRs nuevos que propone:** ninguno.

## Parte 1 · Tasa de cambio manual

Alcance: REQ-005-30, REQ-005-33, REQ-005-34, REQ-005-35 y REQ-005-36; cierra además REQ-001-13
(spec 001).

### Resumen

El mantenedor decidió (2026-10-02) adelantar la tasa de cambio para que el Shell y el panel
muestren ya el equivalente en bolívares. Esta parte 1 hace la **tasa manual**: el encargado o
el administrador la escribe en el panel, el nodo la guarda con su evento y la reparte al
momento a las PCs y al panel. El Shell ya sabe mostrar los Bs en cuanto le llegue una tasa
(T47 de la spec 001); el panel aún no los muestra en ningún sitio y aquí se añaden.

**Queda fuera de esta parte:** la consulta automática al BCV (REQ-005-31, REQ-005-32) y las
tasas con fecha valor futura (CA-005-04), para más adelante; los pagos en bolívares de la caja
(REQ-005-22) van en la parte 2.

### Componentes afectados

| Componente | Cambio |
|---|---|
| `packages/shared` | Esquemas de la tasa (API, evento `exchange_rate.set`, mensaje `exchangeRate` del canal del panel) y funciones puras: tasa vigente y antigüedad en días hábiles |
| `apps/server` | Módulo `exchange-rates`: tabla, servicio y endpoints. Las sesiones ponen la tasa vigente en el `state` de las PCs y el canal del panel la anuncia |
| `apps/panel` | Tasa en la barra superior, diálogo para cambiarla y equivalente en Bs en las pantallas con importes |
| `apps/shell-ui` | Nada nuevo: solo se verifica que muestra los Bs (CA-005-06) |

### Modelo de datos

Una tabla nueva, **solo de inserción** (la historia de tasas es auditoría y nunca se edita):

| Tabla | Campos | Notas |
|---|---|---|
| `exchange_rates` | id (UUIDv7), ves_per_usd_micros (`bigint`, µVES por 1 USD), effective_date (`date`, fecha valor en hora de Caracas), source (`manual` / `bcv`), obtained_at (`timestamptz`), actor (`jsonb`) | REQ-005-33. Índice `(effective_date, obtained_at)` |

- La tasa usa el tipo `VesRate` que ya existe en `@pope/shared` (`40 VES/USD` = `40 000 000`):
  así no hay decimales flotantes (ADR-0015).
- **Tasa vigente** (REQ-005-33): entre las que tienen `effective_date` ≤ hoy en Caracas, la de
  `obtained_at` más reciente. Una tasa **manual** se guarda con `effective_date` = hoy y
  `obtained_at` = ahora, así que **vale desde que se guarda** (REQ-005-34). Cuando llegue la
  parte 2, una tasa del BCV con fecha valor de mañana no desplaza a la manual hasta mañana.
- El servicio guarda la vigente en memoria (una fila) y la recalcula al insertar y al cambiar
  de día. El nodo no consulta la tabla en cada latido.

### Contratos (`packages/shared`, zod)

**API del nodo** (rutas en inglés, como el resto):

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET /exchange-rate` | todo el personal | La tasa vigente (`vesPerUsd`, `effectiveDate`, `source`, `obtainedAt`, `setBy`) o `null`, y `stale` (REQ-005-35) |
| `POST /exchange-rate` | encargado y administrador | Guarda una tasa manual `{ vesPerUsd }`. Emite `exchange_rate.set` y la reparte. Responde la vigente |

- Validación: `vesPerUsd` es un `VesRate` (entero positivo) y como mucho 10 000 000 Bs por USD,
  para frenar errores de tecleo con muchos ceros. El panel lee lo que escribe el encargado
  ("40", "40,5" o "36,5269") con hasta 6 decimales, que es la precisión de `VesRate`.
- **Evento** `exchange_rate.set` (versión 1): `{ vesPerUsd, effectiveDate, source }`, con el
  actor del personal (ADR-0008). Es idempotente por su id, como todos.

**Canal de las PCs:** no cambia el protocolo. El `state` ya lleva `vesRate`; hoy siempre es
`null` y pasa a llevar la tasa vigente. Al cambiar la tasa, el nodo **reenvía el `state`** a
cada PC con una sesión activa, para que el Bs cambie al momento (REQ-005-36).

**Canal del panel:** mensaje nuevo `{ type: 'exchangeRate', rate, stale }`, que el nodo envía
al conectar y cada vez que cambia la tasa o su antigüedad (REQ-005-36).

### Antigüedad de la tasa (REQ-005-35)

Función pura `businessDaysOld(effectiveDate, hoy)` en `@pope/shared`: cuenta los días de lunes
a viernes entre la fecha valor y hoy, en hora de Caracas. La tasa está **desactualizada** si
pasa de 1. Los feriados bancarios no se cuentan todavía (pregunta abierta en la spec); se
añadirán con la consulta al BCV, que es la que sabe qué días publica.

### Panel (diseño "Panel Pope · Fase 8")

- **Barra superior:** una píldora con la tasa vigente, como en el lienzo: "Tasa · 1 USD =
  40,00 Bs", con la fuente y la hora en el texto de ayuda. Variantes:
  - sin tasa: "Sin tasa" en ámbar;
  - desactualizada: "Tasa del lunes" en ámbar (CA-005-05, en lo que toca al aviso).
- **Cambiar la tasa:** al pulsar la píldora, el encargado o el administrador abre "Tasa del
  día": la vigente, un campo "Bs por 1 USD" y "Guardar". El dueño la ve, pero no la abre.
- **Equivalente en Bs** (REQ-005-30, REQ-001-13): debajo de cada importe en USD, con
  `formatBolivares`, como ya dibuja el lienzo. Si no hay tasa, no se muestra nada. Pantallas:
  detalle de la PC del mapa (saldo, cobrado y tarifa), Clientes (saldo), Recargar saldo,
  Vender combo, Sesión temporal (importe), Tarifas y Combos (precio y precio por hora).
- La tasa llega por el canal del panel y se comparte entre pantallas, como el mapa.

### Seguridad

- Solo el encargado y el administrador escriben la tasa (`@Roles`), y queda su nombre en el
  evento. Una tasa equivocada solo afecta a lo que se **muestra** en Bs: en esta parte nadie
  cobra en bolívares. Se corrige guardando otra, y la historia queda.

### Impacto en recursos (ADR-0011)

Una tabla con una fila por cambio de tasa (unas pocas al día) y una fila en memoria. Sin
dependencias nuevas en el servidor ni en el panel. El reenvío del `state` al cambiar la tasa
es un mensaje por PC con sesión, ocasional.

### Estrategia de pruebas

| Nivel | Qué | REQ |
|---|---|---|
| Unitarias (shared) | Tasa vigente entre varias (manual de hoy, BCV de mañana), días hábiles con fin de semana por medio | 33, 35 |
| e2e (server + PGlite) | `POST` por rol (el dueño no), validación, evento con actor y fuente, `GET`, `state` de las PCs con la tasa y reenvío al cambiar, mensaje del canal del panel | 33, 34, 36 |
| Unitarias (panel) | Lectura de "40,5" y "36,5269" a µVES, rechazo de vacío, cero y valores enormes | 34 |
| A mano | CA-005-06 en Chrome: el panel y el Shell muestran el Bs al guardar la tasa | 34, 36, REQ-001-13 |

### Orden de implementación (detalle en `tasks.md`)

1. Contratos y funciones puras en `shared`.
2. Tabla, servicio y endpoints del nodo.
3. La tasa en el `state` de las PCs y en el canal del panel.
4. Píldora y diálogo de la tasa en el panel.
5. Bs en las pantallas del panel.
6. Verificación y cierre de REQ-001-13.

### Riesgos

- **El BCV publica con 8 decimales** (p. ej. 36,52690000) y `VesRate` guarda 6. La diferencia
  es menor de una millonésima de bolívar por dólar: no se nota al redondear a céntimos.
- **Cambio de día:** la antigüedad cambia a medianoche aunque nadie toque la tasa. El servicio
  revisa al cambiar de día (hora de Caracas) y avisa al panel.

## Parte 2 · Inventario, ventas y caja

Alcance: REQ-005-01 a REQ-005-05, REQ-005-10 a REQ-005-14, REQ-005-20 a REQ-005-25,
REQ-005-40 a REQ-005-45 y REQ-005-51 a REQ-005-53, con REQ-005-70 a REQ-005-73. Criterios:
CA-005-01 a CA-005-03 y CA-005-07 a CA-005-11.

### Resumen

Pope sustituye a SENET y a la hoja de papel para las ventas del mostrador (la hoja queda de
respaldo). El administrador da de alta golosinas con foto y precio, y conceptos sin
inventario como "Impresiones". El encargado registra lo que llega, vende desde una pantalla de
**Caja** con la venta nueva a la izquierda y los movimientos del turno a la derecha, y cierra
el día contando el dinero por método. El cierre descarga un PDF de una página para mandar al
grupo; el administrador y el dueño descargan además el detallado de cualquier día.

La pieza central es un **registro único de lo cobrado** (`cash_entries`): cada venta, recarga,
sesión temporal y combo cobrados en caja escriben ahí una fila por pago. De él salen la lista
de movimientos, lo esperado al cerrar y los dos reportes. Los cobros de la spec 001 pasan a
escribirlo también.

### Componentes afectados

| Componente | Cambio |
|---|---|
| `packages/shared` | Contratos de productos, conceptos, movimientos de stock, ventas, registro de caja, turno ampliado y reportes; eventos nuevos y versión 2 de los del turno |
| `apps/server` | Módulos `products` (productos, fotos y stock), `sales` (ventas, conceptos y anulaciones) y `cash` (registro de caja y reportes PDF); el módulo `shifts` gana el fondo inicial y el cierre con conteo; recargas, temporales y combos escriben el registro de caja |
| `apps/panel` | Pantallas Caja, Inventario y Cierres; abrir y cerrar turno con fondo, conteo, confirmación y descarga del PDF |
| `apps/shell-ui` | Nada en esta parte (los pedidos desde el Shell son la parte 3) |

### Modelo de datos

Convenciones de siempre: ids UUIDv7, fechas `timestamptz` en UTC, importes `bigint` en
µ-unidades (ADR-0015). Las tablas de movimientos solo se insertan; nada se borra.

| Tabla | Campos clave | Notas |
|---|---|---|
| `products` | name, price_micros (µUSD), min_stock?, active, photo? (nombre del archivo), updated_at | REQ-005-01. Los cambios de precio quedan en su evento (REQ-005-02) |
| `stock_movements` | product_id, kind (`restock` entrada / `sale` venta / `adjustment` ajuste / `waste` merma), quantity (con signo), reason?, sale_id?, actor, created_at | REQ-005-10. El stock es la suma (REQ-005-11). Anular una venta escribe un movimiento `sale` de signo contrario que apunta a la venta anulada (REQ-005-23) |
| `sale_concepts` | name, unit_price_micros (µUSD, sugerido), active | REQ-005-05 ("Impresiones"…) |
| `sales` | shift_id, customer_id? (si se pagó con saldo), total_micros (µUSD), actor, created_at, voided_at?, void_reason?, voided_by? | Una fila por venta. La anulación no borra: marca y genera los movimientos inversos |
| `sale_lines` | sale_id, product_id? o concept_id?, name (copia), quantity, unit_price_micros, total_micros | Copia de nombre y precio del momento, como los combos (ADR-0014) |
| `cash_entries` | shift_id, source (`sale`/`recharge`/`temporary`/`combo`/`void`), source_id, group (`pc`/`snacks`/`other`), method (`cash_usd`/`cash_ves`/`mobile_payment`/`pos`/`balance`), currency (`USD`/`VES`), amount_micros (en su moneda), usd_micros, ves_rate?, actor, created_at | **Registro único de lo cobrado** (REQ-005-24). Una fila por pago y grupo: una venta con dos métodos escribe dos, y un pago que cubre golosinas y conceptos se reparte en una fila por grupo. La lista del turno junta las filas de cada cobro en un solo movimiento. Las anulaciones, con importe negativo |
| `cash_shifts` (amplía) | + opening_cash_usd_micros, opening_cash_ves_micros, counted (`jsonb`: lo contado por método), expected (`jsonb`), closed_by | REQ-005-40 y REQ-005-42. Lo esperado se guarda al cerrar, para que el reporte no cambie después |
| `ledger` (amplía) | + kind `sale` | Pagar con saldo resta del monedero `money` del cliente (REQ-005-21, CA-005-10) |

**Grupos del reporte** (REQ-005-52): `pc` para recargas, sesiones temporales y combos;
`snacks` para productos; `other` para conceptos. Una venta con productos y conceptos se reparte
por línea entre `snacks` y `other`.

**Bolívares** (REQ-005-22, CA-005-02): un pago en efectivo Bs, pago móvil o punto se guarda en
VES con la tasa vigente al cobrar (`amount_micros` = USD × tasa, redondeado al céntimo) y su
equivalente en USD. Si un pago se reparte entre dos grupos, el importe en Bs se calcula una vez
para todo el pago y se reparte, para que las filas sumen lo que pagó el cliente. Sin tasa no se
puede cobrar en bolívares: el panel lo avisa y ofrece escribirla (de ahí que T04 de la parte 1
vaya antes de la Caja). **Lo mismo vale para recargas, sesiones temporales y combos** de la
spec 001 (mantenedor, 2026-10-02): cobrados en un método de Bs, se guardan en Bs con la tasa;
sin tasa, solo se cobran en efectivo USD.

**Cobros anteriores:** la migración pasa al registro de caja las recargas, temporales y combos
de turnos ya existentes, en USD y sin tasa (entonces no se guardaba), para que la lista y los
reportes del turno abierto estén completos. Los que se cobraron en un método de Bs no entran en
lo esperado de ese método, que se cuenta en Bs; solo afecta a datos de desarrollo, porque Pope
aún no se usa en el local.

**Vender sin stock** (REQ-005-12, mantenedor, 2026-10-02): ajuste del nodo
`allowNegativeStock` (0 o 1, apagado por defecto), que cambia el administrador como los de la
spec 001. Vale para todos los productos.

**Un turno al día y caja del local** (REQ-005-44, mantenedor, 2026-10-02): el turno deja de
ser de cada miembro del personal y pasa a ser **del local**. Solo hay uno abierto (un índice
único parcial lo asegura también ante peticiones simultáneas; la migración cierra los que
hubiera de más, que solo existen en desarrollo). Mientras está abierto, encargados y
administradores cobran en él y cada fila lleva su actor. Lo cierra quien lo abrió o un
administrador. Cerrado, se puede abrir otro el mismo día. `GET /shifts/current` pasa a
devolver la caja abierta del local.

**Anular** (REQ-005-23): solo ventas de la caja abierta; la fila negativa va a esa misma caja.

**Nombre del local** (REQ-005-51, mantenedor, 2026-10-02): ajuste de texto `localName` que
cambia el administrador (por defecto "Pope"). Los ajustes hasta ahora solo eran números: el
evento `setting.changed` pasa a la versión 2, con valores de número o de texto. El panel aún
no tiene pantalla de ajustes: se añade, con este y con `allowNegativeStock`.

### Fotos de los productos (REQ-005-03, REQ-005-73)

- El panel reduce la foto en el navegador (a 512 px de lado como mucho, en WebP con
  `<canvas>`) antes de subirla: el nodo no procesa imágenes ni necesita `sharp` (ADR-0011).
- Se sube con `PUT /products/:id/photo` como cuerpo binario `image/webp`, hasta 512 KB. Fastify
  lo acepta con un `addContentTypeParser`, sin `@fastify/multipart`.
- El nodo la guarda en una carpeta de datos (`POPE_DATA_DIR`, por defecto `data/` junto al
  servidor; variable nueva que se documenta en AGENTS.md) con el id del producto y un hash en
  el nombre, y la sirve con `GET /products/:id/photo` y caché larga.

### Contratos (`packages/shared`, zod)

**API del nodo** (en inglés, como el resto; todo exige sesión del personal):

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET /products` | personal | Productos con su stock y si están bajo mínimo (REQ-005-13) |
| `GET /products/:id/movements` | personal | Últimos movimientos de un producto (el detalle del diseño de Inventario) |
| `POST /products`, `PATCH /products/:id` | administrador | Alta y edición (REQ-005-04) |
| `PUT /products/:id/photo` · `GET /products/:id/photo` | administrador · personal | Foto (REQ-005-03) |
| `POST /products/:id/stock` | entradas: encargado y administrador; ajustes y mermas: administrador | Movimiento de stock con motivo (REQ-005-10, REQ-005-14) |
| `GET /sale-concepts` · `POST`, `PATCH` | personal · administrador | Conceptos (REQ-005-05) |
| `POST /sales` | encargado y administrador, con turno abierto | Venta con líneas y pagos (REQ-005-20 a REQ-005-22) |
| `POST /sales/:id/void` | administrador | Anulación con motivo (REQ-005-23) |
| `GET /shifts/current/entries` | personal | Movimientos del turno, el más reciente arriba (REQ-005-24) |
| `POST /shifts` (amplía) | encargado y administrador | Abre con el fondo inicial (REQ-005-40) |
| `GET /shifts/current/closing` | encargado y administrador | Lo esperado por método, para el cierre (REQ-005-42) |
| `POST /shifts/current/close` (amplía) | quien abrió la caja o un administrador | Cierra con lo contado; responde lo esperado y la diferencia |
| `GET /shifts` | administrador y dueño | Historial de cierres (REQ-005-53) |
| `GET /shifts/:id/report.pdf` | resumen: quien abrió o cerró, administrador y dueño; detallado (`?full=1`): administrador y dueño | Los dos PDF (REQ-005-51, REQ-005-53) |

**Canal del panel:** mensaje nuevo `{ type: 'cash' }` cuando cambia el registro de caja o el
stock; las pantallas abiertas vuelven a pedir lo que muestran. Así dos pestañas del panel ven
la misma lista.

**Eventos** (con actor): `product.created`, `product.updated` (con el precio anterior y el
nuevo, REQ-005-02), `product.photo_set` (la foto también es un cambio de estado), `stock.moved`
(entradas, ajustes y mermas; los de una venta o su anulación ya van en `sale.recorded` y
`sale.voided`), `sale_concept.created`, `sale_concept.updated`, `sale.recorded`, `sale.voided`,
y **versión 2** de `shift.opened` (con el fondo) y `shift.closed` (con lo esperado, lo contado
y la diferencia por método; CA-005-03). La versión 1 de esos dos sigue siendo válida para los
eventos ya guardados.

### Reportes PDF (REQ-005-51 a REQ-005-53)

- Los genera el **nodo** con `pdfkit` (JavaScript puro, sin binarios; fuentes estándar de PDF
  con tildes y eñes). Es una dependencia nueva del servidor: se justifica porque el reporte
  debe salir igual en el local y, más adelante, desde la nube para el dueño (spec 006), y
  porque cabe holgado en el presupuesto de ADR-0011 (se genera bajo demanda y se descarta).
- **Del encargado** (una página, A4 en vertical, sin colores): nombre del local, fecha,
  encargado, apertura y cierre; horas de PC, golosinas, otras ventas y total; tabla por método
  con esperado, contado y diferencia; lo pagado con saldo, aparte. Pensado para imprimir y
  para mandar al grupo de WhatsApp.
- **Detallado:** lo anterior y, después, cada movimiento del turno, las anulaciones con su
  motivo y, por producto, stock inicial, entradas, ventas, ajustes, mermas y stock final. Puede
  ocupar varias páginas.
- Los importes salen con `formatMoney` y `formatBolivares` (ADR-0015), con la hora de Caracas.

### Panel (diseño "Panel Pope · Fase 8": artboards nuevos antes de programar)

- **Caja** (`/caja`), como en la referencia de SENET:
  - **izquierda, venta nueva:** pestañas "Golosinas" (fotos con precio y disponibles) y "Otras
    ventas" (conceptos, con cantidad y precio por unidad editable); el carrito con el total en
    USD y Bs; los pagos (uno o varios métodos; con saldo, buscando la cuenta del cliente).
  - **derecha, movimientos del turno:** la lista de REQ-005-24, con su total por grupo arriba
    y "Anular" para el administrador.
- **Inventario** (`/inventario`), página propia: productos con foto, precio, stock y aviso de
  bajo mínimo, con un **buscador** que filtra por nombre mientras se escribe. **"Nuevo producto"**
  abre un modal (administrador) con nombre, foto, precio, stock mínimo y la cantidad que llegó,
  que se guarda como su primera **entrada** (REQ-005-10: el stock nunca se escribe). Editar usa
  el mismo modal sin la cantidad. Además, "Entrada" (encargado y administrador), "Ajuste" y
  "Merma" (administrador), y la pestaña de conceptos.
- **Turno:** abrir pide el fondo en USD y Bs. **Cerrar** muestra lo esperado por método, pide
  lo contado, enseña la diferencia, pregunta "¿Seguro que quieres cerrar la caja?" y, al
  confirmar, cierra y **descarga el PDF** del encargado (REQ-005-45).
- **Cierres** (`/cierres`, administrador y dueño): historial con los totales de cada día y
  los dos PDF.
- Los importes muestran el Bs debajo cuando hay tasa (parte 1).

### Seguridad

- Roles en cada endpoint (`@Roles`) y turno abierto para vender (REQ-005-43). Solo el
  administrador anula, ajusta y da mermas, y siempre con motivo.
- La foto solo admite `image/webp` hasta 512 KB, y se guarda con un nombre que pone el nodo.
- Nada se borra: anulaciones y correcciones son movimientos nuevos con actor (ADR-0008).

### Impacto en recursos (ADR-0011)

- Tablas pequeñas: unas decenas de ventas y movimientos al día. Las fotos, unos 100 KB cada
  una; con 100 productos, unos 10 MB en disco.
- `pdfkit`: unos pocos MB en disco. Un PDF de una página tarda milisegundos y no se guarda.
- Sin dependencias nuevas en el panel: la foto se reduce con `<canvas>` del navegador.

### Estrategia de pruebas

| Nivel | Qué | REQ / CA |
|---|---|---|
| Unitarias (shared) | Grupos del reporte, importes en Bs con la tasa, lo esperado por método, diferencia | 005-22, 42, 52 |
| e2e (server + PGlite) | Productos y fotos por rol; stock por movimientos; venta con productos y conceptos, varios métodos, Bs y saldo; anulación; turno con fondo y cierre; los cobros de la spec 001 en el registro de caja; PDF (que se genera, una página el del encargado, con los totales) | CA-005-01 a 03, 07 a 11 |
| Unitarias (panel) | Carrito, reparto de pagos, lectura de importes y cantidades | 005-20, 21 |
| A mano | Caja, Inventario y cierre en Chrome, con el PDF impreso | CA-005-07 a 09 |

### Orden de implementación (detalle en `tasks.md`)

1. Diseño de las pantallas en el lienzo del panel, para aprobarlo.
2. Contratos en `shared`.
3. Nodo: productos y fotos, stock, conceptos, registro de caja (con los cobros de la spec 001),
   ventas, anulaciones, turno ampliado y PDF.
4. **T04 de la parte 1** (la tasa en el panel), necesaria para cobrar en bolívares.
5. Panel: Inventario, Caja (venta y movimientos), turno y cierre, historial de cierres.
6. Verificación de la parte 2. Después, T05 a T07 de la parte 1.

### Riesgos

- **Cambiar los cobros de la spec 001** (recargas, temporales, combos) para que escriban el
  registro de caja toca código ya verificado: sus tests e2e deben seguir pasando y se añaden
  los del registro.
- **El PDF de una página** debe caber siempre: el del encargado solo lleva totales, nunca la
  lista de movimientos.
- **Sin tasa no hay cobro en Bs:** si nadie la escribe, solo se puede cobrar en USD. El panel
  lo dice claramente (REQ-005-34).
