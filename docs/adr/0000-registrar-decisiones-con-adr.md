# ADR-0000: Registrar las decisiones con ADR

- **Estado:** Aceptado
- **Fecha:** 2026-09-25
- **Relacionado:** ADR-0013

## Contexto

Buena parte del código de Pope lo escribirán agentes de IA. Un agente sin contexto
tiende a "mejorar" cosas que se decidieron a propósito (cambiar de base de datos, añadir
una dependencia pesada, mover lógica al cliente). Además, el mantenedor necesita
recordar dentro de meses por qué se eligió cada pieza.

## Decisión

Toda decisión arquitectónica se registra como ADR en `docs/adr/` con la
[`plantilla.md`](plantilla.md) (formato inspirado en MADR). `AGENTS.md` obliga a los
agentes a respetar los ADR aceptados y a proponer uno nuevo en vez de contradecirlos.

## Alternativas consideradas

- **Wiki externa o Notion:** queda fuera del repo, los agentes no la leen y se
  desincroniza del código.
- **Comentarios en el código:** no explican decisiones transversales.

## Consecuencias

- ✅ Historia de decisiones versionada junto al código y legible por agentes.
- ⚠️ Cuesta un poco de disciplina: cada decisión importante lleva su commit de ADR.
