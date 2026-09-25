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
| [0007](0007-nodo-local-fuente-de-verdad.md) | El nodo local es la fuente de verdad del tiempo y el saldo | Aceptado |
| [0008](0008-sincronizacion-por-eventos.md) | Sincronización local → nube por eventos (outbox) | Propuesto |
