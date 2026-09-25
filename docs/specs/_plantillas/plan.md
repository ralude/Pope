# Plan NNN: Título

- **Estado:** Borrador | En revisión | Aprobado
- **Spec:** [spec.md](spec.md)
- **ADRs que aplican:** ADR-XXXX
- **ADRs nuevos que propone:** ninguno | ADR-XXXX

## Resumen

Dos o tres frases con el enfoque.

## Componentes afectados

| Componente | Cambio |
|---|---|
| `apps/server` | ... |
| `packages/shared` | ... |

## Modelo de datos

Tablas o columnas nuevas, índices y migraciones. Dinero en enteros y fechas en UTC.

## Contratos

Endpoints, mensajes WebSocket y eventos de outbox, definidos con esquemas zod en
`packages/shared`.

## Flujo principal

Pasos o diagrama de secuencia.

## Casos límite y errores

| Situación | Comportamiento |
|---|---|
| Se corta la red | ... |
| Se va la luz | ... |

## Impacto en recursos (ADR-0011)

RAM, CPU y dependencias nuevas, con justificación.

## Estrategia de pruebas

Qué se prueba con tests unitarios, de integración y a mano, y qué REQ cubre cada prueba.

## Riesgos

- ...
