# ADR-0008: Sincronización local → nube por eventos (outbox)

- **Estado:** Aceptado
- **Fecha:** 2026-09-25
- **Relacionado:** ADR-0001, ADR-0004, spec 006

## Contexto

El nodo local debe enviar a la nube lo que ocurre en el local. La conexión se corta
seguido y el corte de luz puede llegar a mitad de un envío. No se puede perder ni
duplicar nada: la nube se usa para auditar caja y sesiones.

## Decisión

- Cada cambio de estado del nodo local se escribe, **en la misma transacción**, en una
  tabla `outbox` como evento inmutable:
  `{ id: UUIDv7, branch_id, seq, type, actor, occurred_at (UTC), payload }`.
- `seq` es un contador creciente por sucursal que fija el orden.
- Un proceso de envío manda lotes comprimidos por HTTPS cuando hay internet. La nube los
  inserta **de forma idempotente** (ignora ids repetidos) y responde con el último `seq`
  aceptado. El local avanza su cursor solo con esa confirmación.
- La nube construye sus vistas de lectura (ocupación, sesiones, caja, stock) a partir de
  los eventos.
- Cada nodo local se autentica ante la nube con una credencial propia de su sucursal,
  revocable.

## Alternativas consideradas

- **Replicación nativa de PostgreSQL:** exige conexión estable, acopla los esquemas y es
  delicada de operar con cortes frecuentes.
- **Enviar instantáneas periódicas del estado:** pierde el detalle de quién hizo qué y
  cuándo, que es justo lo que el dueño quiere auditar.

## Consecuencias

- ✅ Tolera cortes: el local acumula eventos y los envía al volver la conexión.
- ✅ Los mismos eventos sirven de registro de auditoría.
- ⚠️ La nube va por detrás del local. La web del dueño muestra la antigüedad de los datos.
- ⚠️ Cambiar el formato de los eventos requiere versionarlos (`type` + `version`).
