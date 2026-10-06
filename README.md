<div align="center">

# Pope

**Gestión de cibercafés diseñada para operar en la red local, incluso sin internet.**

Sesiones y tiempo de uso · Saldo y combos · Inventario y caja · Control de PCs

TypeScript · React · NestJS + Fastify · PostgreSQL · C# + WebView2 (en desarrollo)

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](./tsconfig.base.json)
[![Local-first](https://img.shields.io/badge/arquitectura-local--first-2ea44f)](./docs/adr/0001-arquitectura-local-first.md)
[![SDD](https://img.shields.io/badge/desarrollo-spec--driven-blue)](./docs/specs/README.md)

</div>

---

Pope es un proyecto de gestión de cibercafés inspirado en SENET, pensado para un local en
Venezuela cuyo dueño vive en España. Reúne la operación del encargado, la experiencia del
cliente en cada PC y, como siguiente etapa, la consulta remota del negocio desde el navegador.

La base operativa ya incluye cuentas, cobro por tiempo, pausas, ventas, inventario y cierre
de caja. El cliente Windows que bloqueará las PCs y la sincronización con la nube siguen en
desarrollo y planificación. El [estado del proyecto](./ESTADO.md) distingue lo implementado,
lo aprobado y lo pendiente.

## El problema

Un cibercafé necesita saber quién usa cada equipo, cuánto tiempo le queda y qué se ha
cobrado. En este caso, además, debe hacerlo con conectividad y electricidad inestables,
hardware modesto y un dueño que consulta el negocio desde otro país.

| Restricción real | Consecuencia de diseño |
|---|---|
| Internet intermitente | Login, cobro, pausa y ventas se resuelven en el nodo local; la nube recibe los eventos cuando vuelve la conexión |
| Cortes de luz o pérdida de conexión de una PC | El nodo conserva los checkpoints de sesión y aplica reglas explícitas de cierre y recuperación |
| Cobro por segundos y pagos en USD o Bs | Importes en micro-unidades enteras, tiempo en segundos y tasa de cambio registrada en cada pago que la requiere |
| Equipos compartidos entre clientes | El diseño del cliente Windows exige bloqueo, pausa y control de procesos fuera de la interfaz web |
| Servidor i3-2120 con 8 GB de RAM | Presupuesto de memoria acotado, panel ligero y despliegue de artefactos ya compilados |
| Dueño fuera del local | La arquitectura prevé una copia en la nube y una web de consulta, manteniendo al nodo local como fuente de verdad |

## La operación que cubre

- **Encargado:** mapa de PCs en tiempo real, cuentas y recargas, sesiones temporales,
  tarifas y combos, pausas, ventas y caja por turno.
- **Cliente:** interfaz de ingreso, saldo y tiempo restante, compra de combos y pausa de
  sesión. Actualmente se prueba en el Shell de desarrollo, dentro del navegador.
- **Inventario y caja:** productos con foto, entradas y salidas de stock, venta con distintos
  medios de pago o saldo del cliente, anulaciones con motivo y reportes PDF del turno.
- **Dueño — previsto:** consulta desde el navegador sobre los datos sincronizados del local.
  La [spec 006](./docs/specs/006-sincronizacion-y-web-del-dueno/spec.md) está en borrador.

## Lo técnicamente interesante

### Un único lugar decide cuánto cobrar

El nodo local calcula el consumo con su propio reloj y guarda los checkpoints. La PC y el
Shell muestran el estado recibido; no deciden el saldo ni la tarifa. Cada sesión conserva la
tarifa con la que empezó, aunque el encargado cambie los precios durante su uso.

Las cuentas tienen dos saldos: dinero y horas de combo. Se consumen primero las horas y luego
el dinero. El [motor de cobro](./packages/shared/src/billing.ts) recalcula el importe sobre
el total de segundos consumidos, de modo que dividir una sesión en más latidos no acumula
errores de redondeo. Los productos intermedios se calculan con `BigInt`.

### Dinero entero, con precisión para cobrar por segundos

`1 USD = 1 000 000` micro-unidades. Los importes se validan como enteros seguros y llevan
código de moneda; el tiempo se expresa en segundos enteros. La presentación redondea a
céntimos mediante `formatMoney`, sin recortar la precisión del saldo almacenado.

La tasa manual permite mostrar equivalentes en Bs y registrar el importe, la moneda y la
tasa aplicada al pago. La consulta automática al BCV sigue pendiente. La decisión de
precisión está documentada en [ADR-0015](./docs/adr/0015-dinero-en-micro-unidades.md).

### Recuperación con reglas observables

Si una PC deja de enviar latidos y supera la gracia configurada, el nodo cierra la sesión y
cobra hasta el último latido. Las sesiones temporales conservan su tiempo recuperable; al
reconectar se concilia el restante informado por la PC con el guardado por el nodo.

Estas situaciones se comprueban en [tests de pérdida de latidos y reconexión](./apps/server/src/sessions/no-heartbeat.e2e.test.ts).
La recuperación y el bloqueo efectivos del cliente Windows forman parte de la spec 003.

### Pausa y cobro son estados distintos

La pausa detiene el consumo dentro de los límites configurados. Si vence su duración máxima,
el cobro se reanuda aunque la PC siga en pausa: el panel y el Shell muestran ese estado de
forma explícita. Hay límites por sesión y por día, y las sesiones temporales no permiten pausa.

La [verificación de la fase 1](./docs/specs/002-pausa-de-sesion/mediciones.md) incluye pruebas
automáticas y recorridos con el nodo, el panel, el Shell de desarrollo y el simulador. El
escritorio separado de Windows y su latencia de bloqueo se verificarán en la fase nativa.

### Cambio y auditoría se confirman juntos

Los cambios de estado y sus eventos se guardan en una misma transacción mediante
[`EventsService.inTransaction`](./apps/server/src/events/events.service.ts): un fallo revierte
ambos. Cada evento registra UUIDv7, actor, tipo, versión y fecha UTC. Los consumidores locales
reciben el aviso después de confirmar la transacción.

El stock se modifica mediante movimientos; las anulaciones dejan su motivo y sus efectos en
inventario y caja. Esta historia también prepara la sincronización por eventos prevista en
[ADR-0008](./docs/adr/0008-sincronizacion-por-eventos.md), cuyo transporte a la nube aún no está
implementado.

### El hardware forma parte del diseño

El nodo del local será un i3-2120 de dos núcleos con 8 GB de RAM, casi siempre encendido. El
presupuesto de Pope ronda 1 GB en total: PostgreSQL hasta 512 MB y Node hasta 384 MB. El nodo
recibe artefactos construidos en otro equipo; el panel usa colores planos, sin desenfoques
ni animaciones.

El cliente Windows está diseñado con un servicio y host mínimos en C#, React dentro de
WebView2 y un escritorio Win32 separado para bloqueo y pausa. Las reglas de negocio siguen
en TypeScript. Véanse [ADR-0016](./docs/adr/0016-servidor-del-local-i3-siempre-encendido.md),
[ADR-0005](./docs/adr/0005-shell-react-en-webview2.md) y
[ADR-0009](./docs/adr/0009-escritorio-separado-para-bloqueo-y-pausa.md).

## Arquitectura

La arquitectura acordada separa la operación del local de la consulta remota:

```text
PC cliente                         Nodo local · fuente de verdad
Agente C# + Shell React   ── LAN ── NestJS + Fastify + PostgreSQL
en WebView2                         │
                                    ├── Panel del encargado · navegador
                                    │
                                    └── Eventos al recuperar internet
                                                 │
                                    Nube · NestJS + PostgreSQL
                                                 │
                                    Web del dueño · navegador
```

Hoy funcionan el nodo local, el panel, el Shell en navegador y el simulador de PCs. El
agente nativo está en desarrollo por contratos y datos; la copia en la nube y la web del
dueño están especificadas como trabajo futuro.

| Capa | Tecnología | Función |
|---|---|---|
| Nodo local | NestJS sobre Fastify | API, sesiones, cobro, caja y canales WebSocket |
| Persistencia | PostgreSQL + Drizzle ORM | Estado operativo, movimientos y eventos transaccionales |
| Panel | React + Vite + wouter | Operación del encargado desde el navegador |
| Shell | React + Vite | Interfaz del cliente y canal de desarrollo; host WebView2 previsto |
| Cliente Windows — pendiente | C# / .NET + Win32 + WebView2 | Servicio, escritorios, procesos y host del Shell |
| Contratos y reglas compartidas | TypeScript estricto + zod | Validación de entradas, respuestas y eventos; dinero y tiempo |
| Pruebas | Vitest + PGlite / PostgreSQL real | Lógica, integración, API y protocolos |
| Monorepo | pnpm + Turborepo | Paquetes y ejecución de verificaciones |

## Calidad verificable

Las pruebas enlazan requisitos `REQ` con criterios de aceptación `CA`. El servidor se prueba
por defecto con PGlite y dispone de una ejecución contra PostgreSQL real; el panel y el Shell
tienen tests de lógica y verificación manual de pantallas.

La [bitácora](./ESTADO.md#bitácora) registra una batería de **896 tests** el 2026-10-05, incluidos
378 del servidor, que también pasaron contra PostgreSQL real. Esa cifra corresponde a esa
verificación; el resultado del árbol actual se obtiene ejecutando los comandos de abajo.

En la [prueba de carga de sesiones](./docs/specs/001-cuentas-y-sesiones/mediciones.md), con
40 PCs simuladas conectadas y un login cada 1,5 s, se midieron **69 ms de p95** y un pico de
**221,8 MB de RSS** del servidor. La medición fue en un Ryzen 5 5500 con 31,8 GB de RAM:
repetirla en el i3-2120 del local y medir una ejecución prolongada sigue pendiente.

La [matriz de inventario y caja](./docs/specs/005-inventario-y-caja/mediciones.md) conserva las
pruebas de ventas, stock, anulaciones, pagos y arqueo. El tiempo de venta en el hardware del
local y la impresión física del reporte PDF también están pendientes.

## Cómo ejecutarlo en desarrollo

Requisitos: **Node 24 LTS**, **pnpm 12** (el repositorio fija `12.4.2`) y una base PostgreSQL
de desarrollo ya creada. Ejecuta desde la raíz, en PowerShell:

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm build

# Sustituye usuario, contraseña y base por los de tu PostgreSQL de desarrollo.
$env:DATABASE_URL = 'postgres://pope:clave@127.0.0.1:5432/pope'
$env:POPE_MODE = 'local'

# Administrador inicial: pide usuario, nombre y contraseña de forma interactiva.
pnpm --filter @pope/server staff:create-admin

# PCs de ejemplo, solo para desarrollo.
pnpm --filter @pope/server dev:seed-pcs

# Nodo local: aplica las migraciones pendientes al arrancar.
pnpm --filter @pope/server start
```

Abre `http://127.0.0.1:3000` para entrar al panel compilado con el administrador creado.
`GET /health` permite comprobar el nodo. Desde el panel puedes configurar tarifas, crear
clientes, recargar saldo y abrir la caja antes de registrar cobros.

Para desarrollar las interfaces, deja el nodo activo y ejecuta cada comando en otra terminal:

```powershell
pnpm --filter @pope/panel dev
pnpm --filter @pope/shell-ui dev
```

El panel abre en `http://127.0.0.1:5173` y el Shell en `http://localhost:5174/?pc=1`, que usa
la PC 01 de ejemplo. En este modo el Shell envía el saludo y los latidos por WebSocket como
agente de desarrollo. Esa prueba permite recorrer las sesiones; el bloqueo del sistema
operativo requiere la implementación nativa pendiente.

Verificaciones desde la raíz:

```powershell
pnpm lint
pnpm typecheck
pnpm test

# Opcional: tests del servidor en PostgreSQL real. Exige permiso CREATEDB.
$env:TEST_DATABASE_URL = 'postgres://postgres@127.0.0.1:5432/postgres'
pnpm --filter @pope/server test:pg
```

## Estado del proyecto

El avance se mantiene en [`ESTADO.md`](./ESTADO.md), junto con bloqueos y verificaciones.
Este resumen presenta el alcance por funcionalidad:

| Spec | Alcance | Estado |
|---|---|---|
| [001](./docs/specs/001-cuentas-y-sesiones/spec.md) | Cuentas, saldo, combos, tarifas y sesiones | Implementada; equivalente en Bs verificado en la 005, en revisión |
| [002](./docs/specs/002-pausa-de-sesion/spec.md) | Pausa, límites y reanudación del cobro | Fase 1 implementada, verificada y aprobada; fase nativa pendiente de la 003 |
| [003](./docs/specs/003-bloqueo-de-pc/spec.md) | Arranque, registro, bloqueo y mantenimiento de PCs | Contratos y datos aprobados, en curso; resto del plan en borrador |
| [004](./docs/specs/004-lista-blanca-de-aplicaciones/spec.md) | Aplicaciones permitidas y vías de escape | Borrador |
| [005](./docs/specs/005-inventario-y-caja/spec.md) | Tasa, productos, stock, ventas y caja | Inventario y caja verificados; tasa manual en revisión; parte 3 en borrador |
| [006](./docs/specs/006-sincronizacion-y-web-del-dueno/spec.md) | Sincronización y consulta remota | Borrador |
| [007](./docs/specs/007-autorrecarga-pago-movil/spec.md) | Autorrecarga por pago móvil | Borrador, futura |
| [008](./docs/specs/008-migracion-desde-senet/spec.md) | Migración de clientes desde SENET | Borrador |

El cierre de la experiencia completa requiere implementar y verificar el cliente Windows,
resolver la lista blanca y probar en el hardware del local. La operación remota requiere
además la sincronización y la web del dueño.

## Cómo se construye

Pope sigue **Spec-Driven Development**: `spec.md` define qué y por qué; `plan.md`, cómo;
`tasks.md`, los pasos verificables. El mantenedor aprueba cada documento antes de avanzar.
Cada tarea liga implementación, pruebas y commit con sus requisitos, y actualiza el estado.

Las decisiones caras de revertir se documentan como ADR con contexto, alternativas y
consecuencias. Un ADR propuesto se mantiene pendiente hasta su aprobación. El
[proceso SDD](./docs/specs/README.md) y el [índice de ADR](./docs/adr/README.md) permiten
seguir tanto el diseño como las decisiones todavía abiertas.

## Mapa del repositorio

```text
apps/
  server/           Nodo local y base del modo cloud · NestJS + PostgreSQL
  panel/            Panel del encargado · React
  shell-ui/         Interfaz del cliente · React
packages/
  shared/           Contratos zod y reglas compartidas de dinero, tiempo y negocio
tools/
  agent-sim/        Simulador de PCs y pruebas de carga
docs/
  adr/              Decisiones arquitectónicas y su estado
  specs/            Requisitos, planes, tareas y mediciones
```

`apps/native/` está prevista para el agente y el host de Windows; aún no existe en el árbol.

## Documentación

| Documento | Contenido |
|---|---|
| [`ESTADO.md`](./ESTADO.md) | Avance actual, siguiente tarea, bloqueos y bitácora |
| [`docs/adr/`](./docs/adr/README.md) | Decisiones de arquitectura y alternativas evaluadas |
| [`docs/specs/`](./docs/specs/README.md) | Proceso SDD y especificaciones de producto |
| [Mediciones de sesiones](./docs/specs/001-cuentas-y-sesiones/mediciones.md) | Carga, memoria, argon2id y criterios de aceptación |
| [Verificación de pausa](./docs/specs/002-pausa-de-sesion/mediciones.md) | Pruebas de pausa, reanudación, límites y reconexión |
| [Verificación de inventario y caja](./docs/specs/005-inventario-y-caja/mediciones.md) | Stock, ventas, pagos, anulaciones y reportes |
| [`AGENTS.md`](./AGENTS.md) | Reglas de colaboración, convenciones y comandos del repositorio |
