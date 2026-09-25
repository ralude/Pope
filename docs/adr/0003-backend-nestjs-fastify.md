# ADR-0003: Backend con NestJS sobre Fastify, un código en dos modos

- **Estado:** Aceptado
- **Fecha:** 2026-09-25
- **Relacionado:** ADR-0001, ADR-0002, ADR-0008, ADR-0011

## Contexto

El mismo dominio corre en dos sitios: el nodo local (opera el negocio) y la nube (recibe
eventos y sirve la web del dueño). El mantenedor sabe TypeScript. Buena parte del código
lo escribirán agentes de IA, que rinden mejor con convenciones fuertes y predecibles.

## Decisión

- **NestJS** con el adaptador **Fastify** (más rápido y ligero que Express).
- Un solo `apps/server` con la variable `POPE_MODE=local|cloud`, que decide qué módulos
  se cargan:
  - `local`: auth de clientes, sesiones, gateway de agentes (WebSocket), POS,
    inventario, caja y emisor de outbox.
  - `cloud`: receptor de eventos, vistas de lectura del dueño y auth del dueño.
  - Común: dominio, validación y esquemas.
- Tiempo real con agentes y panel mediante **WebSocket** (gateway de NestJS con
  Socket.IO o `ws`; se decide en el plan de la spec 003 según el consumo de memoria).
- Proceso único con límite de memoria según ADR-0011 (≤ 384 MB).

## Alternativas consideradas

- **Fastify o Hono sin framework:** más ligero, pero sin la estructura de módulos e
  inyección de dependencias que guía a los agentes. La diferencia de RAM (~30–50 MB)
  cabe en el presupuesto.
- **ASP.NET Core:** excelente, pero el mantenedor no sabe C#.

## Consecuencias

- ✅ Estructura modular clara: cada spec suele mapear a un módulo.
- ✅ Un solo código de servidor para local y nube.
- ⚠️ NestJS tiene más "magia" (decoradores, DI). Se mitiga con las convenciones de
  `AGENTS.md`.
- ⚠️ Hay que medir el consumo real en el nodo local al terminar la spec 001.
