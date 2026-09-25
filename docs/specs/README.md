# Especificaciones (Spec-Driven Development)

Cómo se construye cada funcionalidad de Pope. Decisión de base: [ADR-0013](../adr/0013-spec-driven-development.md).

## Estructura

```
docs/specs/
  _plantillas/        spec.md · plan.md · tasks.md
  NNN-nombre-corto/
    spec.md           QUÉ y POR QUÉ
    plan.md           CÓMO
    tasks.md          PASOS (1 tarea = 1 commit)
```

## Flujo

```
Borrador ──► En revisión ──► Aprobada ──► Implementada
   ▲              │
   └── cambios ◄──┘
```

| Paso | Quién | Resultado |
|---|---|---|
| 1. Escribir `spec.md` | agente o mantenedor | requisitos `REQ-NNN-MM` y criterios `CA-NNN-MM` |
| 2. Revisar y aprobar la spec | **mantenedor** | `Estado: Aprobada` |
| 3. Escribir `plan.md` | agente | diseño técnico ligado a los REQ y ADR |
| 4. Revisar y aprobar el plan | **mantenedor** | `Estado: Aprobado` |
| 5. Escribir `tasks.md` | agente | tareas atómicas ordenadas |
| 6. Implementar tarea por tarea | agente | un commit por tarea, con la tarea marcada `[x]` |
| 7. Cerrar | mantenedor | spec en `Implementada` |

Cada documento se entrega en **su propio commit** (`docs(specs): ...`).

## Reglas para los agentes

- **No escribas código si la spec no está `Aprobada` y el plan `Aprobado`.**
- No añadas requisitos que no están en la spec. Si falta algo, apúntalo en
  "Preguntas abiertas" y pregunta.
- Implementa **solo la tarea pedida**. Si descubres trabajo extra, añádelo como tarea
  nueva en `tasks.md` y no lo hagas en el mismo commit.
- Si la spec está mal o la realidad la contradice, corrige primero la spec (commit
  propio) y luego sigue.
- Los nombres de test incluyen el requisito que prueban:
  `it('REQ-002-03: no descuenta tiempo mientras está en pausa', ...)`.

## Cómo escribir buenos requisitos

- Uno por línea, verificable, con **debe**. Ejemplo: "REQ-002-03: El sistema **debe**
  dejar de descontar tiempo en cuanto la sesión entra en pausa."
- Criterios de aceptación con **Dado / Cuando / Entonces**.
- Números concretos en lugar de "rápido" o "pocos": "en < 1 s", "máximo 3 pausas".
- Todo lo que queda fuera se escribe en "Fuera de alcance".

## Cómo escribir buenas tareas

- Cada tarea cabe en un commit revisable (orientativo: < 400 líneas).
- Deja el repo compilando y con los tests en verde.
- Indica qué REQ cubre, cómo se verifica y el mensaje de commit sugerido.
- Ordenadas: primero contratos y datos, luego lógica con tests y al final la interfaz.

## Frases útiles para pedir trabajo a un agente

- "Redacta la spec 007 para <funcionalidad> usando la plantilla. No escribas código."
- "Lee `docs/specs/002-pausa-de-sesion/spec.md` y propón `plan.md`."
- "Genera `tasks.md` para la spec 002 a partir del plan aprobado."
- "Implementa la tarea T03 de `docs/specs/002-pausa-de-sesion/tasks.md`."

## Índice

| # | Spec | Estado |
|---|---|---|
| [001](001-cuentas-y-sesiones/spec.md) | Cuentas y sesiones | Aprobada · plan en revisión |
| [002](002-pausa-de-sesion/spec.md) | Pausa de sesión | Borrador |
| [003](003-bloqueo-de-pc/spec.md) | Arranque y bloqueo de la PC cliente | Borrador |
| [004](004-lista-blanca-de-aplicaciones/spec.md) | Lista blanca de aplicaciones y herramientas | Borrador |
| [005](005-inventario-y-caja/spec.md) | Inventario de productos y caja | Borrador |
| [006](006-sincronizacion-y-web-del-dueno/spec.md) | Sincronización con la nube y web del dueño | Borrador |
| [007](007-autorrecarga-pago-movil/spec.md) | Autorrecarga desde el Shell con verificación de pago móvil | Borrador (futura) |
| [008](008-migracion-desde-senet/spec.md) | Migración de clientes desde SENET | Borrador |
