# Registros de decisiones de arquitectura (ADR)

Un ADR documenta **una** decisión importante: el contexto, lo que se decidió, las
alternativas descartadas y sus consecuencias. Sirve para que nadie (persona o agente de IA)
tenga que adivinar por qué el sistema es como es.

## Cuándo escribir un ADR

- Elegir o cambiar una tecnología, framework o base de datos.
- Definir un protocolo, formato de datos o contrato entre componentes.
- Cualquier decisión de seguridad.
- Cualquier cosa que sería cara de revertir.

## Estados

| Estado | Significado |
|---|---|
| **Propuesto** | Recomendación pendiente de confirmar. No construyas encima sin preguntar. |
| **Aceptado** | Decisión vigente. Se respeta. |
| **Rechazado** | Se evaluó y se descartó. Se conserva como historia. |
| **Reemplazado por ADR-XXXX** | Ya no aplica; ver el ADR nuevo. |

Los ADR **no se reescriben**: para cambiar una decisión se crea uno nuevo que reemplaza al
anterior, y en el viejo solo se actualiza el estado.

## Cómo crear uno

1. Copia [`plantilla.md`](plantilla.md) como `NNNN-titulo-en-kebab-case.md` con el
   siguiente número libre.
2. Rellénalo con estado **Propuesto**.
3. Añádelo al índice de abajo.
4. Commit propio: `docs(adr): propone ADR-NNNN <título>`.

## Índice

| # | Título | Estado |
|---|---|---|
| [0000](0000-registrar-decisiones-con-adr.md) | Registrar las decisiones con ADR | Aceptado |
| [0001](0001-arquitectura-local-first.md) | Arquitectura local-first con copia en la nube | Aceptado |
| [0002](0002-monorepo-typescript.md) | Monorepo con pnpm y Turborepo | Aceptado |
| [0003](0003-backend-nestjs-fastify.md) | Backend con NestJS sobre Fastify, un código en dos modos | Aceptado |
| [0004](0004-postgresql-local-y-nube.md) | PostgreSQL en el nodo local y en la nube, con Drizzle ORM | Aceptado |
| [0005](0005-shell-react-en-webview2.md) | Interfaz del Shell en React dentro de WebView2 | Aceptado |
| [0006](0006-agente-nativo-en-csharp.md) | Agente y host nativos en C# (.NET), reducidos al mínimo | Aceptado |
| [0007](0007-nodo-local-fuente-de-verdad.md) | El nodo local es la fuente de verdad del tiempo y el saldo | Aceptado |
| [0008](0008-sincronizacion-por-eventos.md) | Sincronización local → nube por eventos (outbox) | Aceptado |
| [0009](0009-escritorio-separado-para-bloqueo-y-pausa.md) | Bloqueo y pausa en un escritorio Win32 separado | Aceptado |
| [0010](0010-lista-blanca-y-restauracion.md) | Lista blanca de aplicaciones y restauración de configuración | Propuesto |
| [0011](0011-presupuesto-de-recursos-nodo-local.md) | Presupuesto de recursos del nodo local | Reemplazado por ADR-0016 |
| [0012](0012-web-del-dueno-sin-instalacion.md) | La web del dueño es solo navegador, sin instalación | Aceptado |
| [0013](0013-spec-driven-development.md) | Desarrollo guiado por especificaciones (SDD) para agentes de IA | Aceptado |
| [0014](0014-dos-saldos-dinero-y-horas-de-combo.md) | Dos saldos por cuenta, dinero y horas de combo | Aceptado |
| [0015](0015-dinero-en-micro-unidades.md) | Importes en micro-unidades enteras | Aceptado |
| [0016](0016-servidor-del-local-i3-siempre-encendido.md) | El servidor del local es un i3-2120 con 8 GB, casi siempre encendido | Aceptado |
