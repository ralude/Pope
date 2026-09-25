# ADR-0013: Desarrollo guiado por especificaciones (SDD) para agentes de IA

- **Estado:** Aceptado
- **Fecha:** 2026-09-25
- **Relacionado:** ADR-0000

## Contexto

La mayor parte del código la escribirán agentes de IA. Con instrucciones vagas, un agente
rellena los huecos inventando: requisitos que nadie pidió, casos límite ignorados o
cambios demasiado grandes para revisarlos. El mantenedor necesita revisar **intención**
antes que código, y commits pequeños que pueda entender.

## Decisión

Toda funcionalidad sigue el flujo **spec → plan → tasks → código** en
`docs/specs/NNN-nombre/`, inspirado en GitHub Spec Kit:

| Documento | Responde | Lo aprueba |
|---|---|---|
| `spec.md` | **Qué** y **por qué**: historias, requisitos `REQ-NNN-MM` y criterios de aceptación | el mantenedor |
| `plan.md` | **Cómo**: módulos, datos, contratos, riesgos, ADRs afectados | el mantenedor |
| `tasks.md` | **Pasos**: tareas pequeñas y ordenadas, cada una es un commit | el mantenedor |

- `AGENTS.md` actúa como "constitución": reglas que ninguna spec puede saltarse.
- No se implementa nada sin spec aprobada.
- Si la implementación revela un error en la spec, primero se corrige la spec (commit
  propio) y después el código.
- Los tests y commits citan los IDs de requisito para poder rastrear cada requisito
  hasta su código.

Proceso detallado: [`docs/specs/README.md`](../specs/README.md).

## Alternativas consideradas

- **Pedir funcionalidades por chat sin documento:** el contexto se pierde entre sesiones
  y no queda registro de lo acordado.
- **Issues de GitHub como spec:** fuera del repo, y los agentes no los leen de forma fiable.

## Consecuencias

- ✅ El mantenedor revisa decisiones en texto antes de que exista código.
- ✅ Cualquier agente, en cualquier sesión, retoma el trabajo leyendo `tasks.md`.
- ✅ Commits pequeños que se corresponden con tareas.
- ⚠️ Más documentación por adelantado. Para cambios triviales (typos, bumps de
  dependencias) no hace falta spec.
