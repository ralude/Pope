# ADR-0002: Monorepo con pnpm y Turborepo

- **Estado:** Propuesto
- **Fecha:** 2026-09-25
- **Relacionado:** ADR-0003, ADR-0005, ADR-0006

## Contexto

Pope tiene varias piezas que comparten tipos y reglas: servidor, panel, interfaz del
Shell y agente nativo. El mantenedor domina TypeScript. Los agentes de IA trabajan mejor
cuando el contrato entre componentes está en un solo lugar tipado.

## Decisión

Un solo repositorio con **pnpm workspaces** y **Turborepo**:

```
apps/server       NestJS (modo local | cloud)
apps/panel        React + Vite (encargado y dueño)
apps/shell-ui     React + Vite (interfaz del cliente)
apps/native       Solución .NET (Pope.Agent, Pope.ShellHost)
packages/shared   Esquemas zod, tipos, reglas de negocio puras
```

- Los mensajes entre agente y servidor se definen con **zod** en `packages/shared` y se
  exportan como **JSON Schema**. El lado C# valida esos mismos esquemas en sus tests para
  que no se desincronicen.
- Turborepo orquesta las tareas de TypeScript. `apps/native` se construye con la CLI de
  `dotnet` mediante un script del workspace.
- Los artefactos del nodo local se generan con `pnpm deploy` (solo dependencias de
  producción), como exige ADR-0011.

## Alternativas consideradas

- **Varios repositorios:** los contratos se desincronizan y cada cambio se reparte en
  varios PRs.
- **Nx:** más potente, pero más configuración de la que este proyecto necesita.

## Consecuencias

- ✅ Un cambio de contrato se ve entero en un solo commit.
- ✅ Los agentes de IA encuentran tipos y reglas en un único paquete compartido.
- ⚠️ Conviven dos toolchains (Node y .NET); el README de `apps/native` debe explicar el
  suyo.
