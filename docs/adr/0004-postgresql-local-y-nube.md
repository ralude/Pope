# ADR-0004: PostgreSQL en el nodo local y en la nube, con Drizzle ORM

- **Estado:** Aceptado
- **Fecha:** 2026-09-25
- **Relacionado:** ADR-0003, ADR-0008, ADR-0011

## Contexto

Se necesita una base de datos transaccional en el nodo local (dinero, stock, sesiones) y
otra en la nube (eventos de todas las sucursales y vistas del dueño). El nodo local tiene
poca RAM (ADR-0011).

## Decisión

- **PostgreSQL** (versión estable vigente) en ambos lados, ajustado en el local según
  ADR-0011.
- **Drizzle ORM** con migraciones de `drizzle-kit`. Es TypeScript puro, sin motor binario
  aparte, y genera SQL predecible.
- Todo el dinero se guarda como `bigint` en unidades mínimas junto a su código de moneda.
  Las fechas se guardan como `timestamptz` en UTC.

## Alternativas consideradas

- **SQLite en el nodo local:** más ligero (sin servicio aparte) y capaz para ~40 PCs en
  modo WAL. Se descarta **por ahora** porque obliga a mantener dos dialectos SQL y dos
  juegos de migraciones. **Es el plan B** si PostgreSQL no cabe en el presupuesto
  medido.
- **Prisma:** más pesado y con un modelo de migraciones menos transparente.
- **MongoDB u otra NoSQL:** caja y stock necesitan transacciones y relaciones.

## Consecuencias

- ✅ Un solo esquema y un solo juego de migraciones para local y nube.
- ✅ Transacciones fuertes para dinero y stock.
- ⚠️ PostgreSQL es un servicio más que instalar y vigilar en el nodo local.
