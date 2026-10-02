# Plan 005 · Parte 1: tasa de cambio manual

- **Estado:** Propuesto
- **Spec:** [spec.md](spec.md), sección "Moneda y tasa de cambio (BCV)": REQ-005-30, REQ-005-33,
  REQ-005-34, REQ-005-35 y REQ-005-36. Cierra además REQ-001-13 (spec 001).
- **ADRs que aplican:** ADR-0001 (local-first), ADR-0007 (el nodo decide), ADR-0008 (eventos),
  ADR-0011 (recursos), ADR-0015 (importes en micro-unidades).
- **ADRs nuevos que propone:** ninguno.

## Resumen

El mantenedor decidió (2026-10-02) adelantar la tasa de cambio para que el Shell y el panel
muestren ya el equivalente en bolívares. Esta parte 1 hace la **tasa manual**: el encargado o
el administrador la escribe en el panel, el nodo la guarda con su evento y la reparte al
momento a las PCs y al panel. El Shell ya sabe mostrar los Bs en cuanto le llegue una tasa
(T47 de la spec 001); el panel aún no los muestra en ningún sitio y aquí se añaden.

**Queda para la parte 2:** la consulta automática al BCV (REQ-005-31, REQ-005-32), las tasas
con fecha valor futura (CA-005-04) y los pagos en bolívares de la caja (REQ-005-22), que van
con el resto de la spec 005.

## Componentes afectados

| Componente | Cambio |
|---|---|
| `packages/shared` | Esquemas de la tasa (API, evento `exchange_rate.set`, mensaje `exchangeRate` del canal del panel) y funciones puras: tasa vigente y antigüedad en días hábiles |
| `apps/server` | Módulo `exchange-rates`: tabla, servicio y endpoints. Las sesiones ponen la tasa vigente en el `state` de las PCs y el canal del panel la anuncia |
| `apps/panel` | Tasa en la barra superior, diálogo para cambiarla y equivalente en Bs en las pantallas con importes |
| `apps/shell-ui` | Nada nuevo: solo se verifica que muestra los Bs (CA-005-06) |

## Modelo de datos

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

## Contratos (`packages/shared`, zod)

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

## Antigüedad de la tasa (REQ-005-35)

Función pura `businessDaysOld(effectiveDate, hoy)` en `@pope/shared`: cuenta los días de lunes
a viernes entre la fecha valor y hoy, en hora de Caracas. La tasa está **desactualizada** si
pasa de 1. Los feriados bancarios no se cuentan todavía (pregunta abierta en la spec); se
añadirán con la consulta al BCV, que es la que sabe qué días publica.

## Panel (diseño "Panel Pope · Fase 8")

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

## Seguridad

- Solo el encargado y el administrador escriben la tasa (`@Roles`), y queda su nombre en el
  evento. Una tasa equivocada solo afecta a lo que se **muestra** en Bs: en esta parte nadie
  cobra en bolívares. Se corrige guardando otra, y la historia queda.

## Impacto en recursos (ADR-0011)

Una tabla con una fila por cambio de tasa (unas pocas al día) y una fila en memoria. Sin
dependencias nuevas en el servidor ni en el panel. El reenvío del `state` al cambiar la tasa
es un mensaje por PC con sesión, ocasional.

## Estrategia de pruebas

| Nivel | Qué | REQ |
|---|---|---|
| Unitarias (shared) | Tasa vigente entre varias (manual de hoy, BCV de mañana), días hábiles con fin de semana por medio | 33, 35 |
| e2e (server + PGlite) | `POST` por rol (el dueño no), validación, evento con actor y fuente, `GET`, `state` de las PCs con la tasa y reenvío al cambiar, mensaje del canal del panel | 33, 34, 36 |
| Unitarias (panel) | Lectura de "40,5" y "36,5269" a µVES, rechazo de vacío, cero y valores enormes | 34 |
| A mano | CA-005-06 en Chrome: el panel y el Shell muestran el Bs al guardar la tasa | 34, 36, REQ-001-13 |

## Orden de implementación (detalle en `tasks.md`)

1. Contratos y funciones puras en `shared`.
2. Tabla, servicio y endpoints del nodo.
3. La tasa en el `state` de las PCs y en el canal del panel.
4. Píldora y diálogo de la tasa en el panel.
5. Bs en las pantallas del panel.
6. Verificación y cierre de REQ-001-13.

## Riesgos

- **El BCV publica con 8 decimales** (p. ej. 36,52690000) y `VesRate` guarda 6. La diferencia
  es menor de una millonésima de bolívar por dólar: no se nota al redondear a céntimos.
- **Cambio de día:** la antigüedad cambia a medianoche aunque nadie toque la tasa. El servicio
  revisa al cambiar de día (hora de Caracas) y avisa al panel.
