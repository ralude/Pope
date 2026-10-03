# ADR-0011: Presupuesto de recursos del nodo local

- **Estado:** Reemplazado por ADR-0016 (el PC es un i3-2120, no un i5; ADR-0016 mantiene el presupuesto y las reglas de este)
- **Fecha:** 2026-09-25
- **Relacionado:** ADR-0003, ADR-0004, ADR-0005

## Contexto

El PC que hará de nodo local es limitado:

- **CPU:** Intel Core i5 de 2ª generación (Sandy Bridge, 2011). Normalmente 4 núcleos y 4
  hilos. Soporta AVX pero **no AVX2**.
- **RAM:** 8 GB.
- Windows 11 no admite oficialmente CPUs de 2ª generación, y el soporte gratuito de
  Windows 10 terminó en octubre de 2025.

Es probable que el encargado use ese mismo PC con un navegador abierto.

## Decisión

Presupuesto máximo de Pope en el nodo local: **~1 GB de RAM**.

| Componente | Límite | Cómo se aplica |
|---|---|---|
| PostgreSQL | ≤ 512 MB | `shared_buffers=128MB`, `work_mem=4MB`, `max_connections=20` |
| Servidor Node (API + panel estático + sincronización) | ≤ 384 MB | un solo proceso, `--max-old-space-size=256` |
| Pestaña del panel en el navegador | lo más ligera posible | sin librerías de gráficos o de interfaz pesadas |

Reglas:

- **Sin Docker** en el nodo local: todo se instala de forma nativa como servicio.
- **No se compila en el nodo local**: recibe el servidor ya empaquetado (un bundle) y el
  panel como archivos estáticos.
- Los binarios elegidos deben funcionar **sin AVX2**.
- Objetivo de rendimiento: **40 PCs conectadas** con una latencia p95 de la API
  **< 200 ms** en este hardware. Se verificará con un simulador de agentes.

Recomendaciones no obligatorias:

- Cambiar a **SSD** si el disco es mecánico. Es la mejora más barata y la que más se nota.
- Si el PC es exclusivo para Pope, instalar **Debian** (ligero y con soporte vigente).
  Si lo usa el encargado, Windows 10 con ESU o LTSC.

## Alternativas consideradas

- **Docker Compose:** cómodo, pero en Windows necesita WSL2 y se come entre 1 y 2 GB solo
  en la máquina virtual.
- **Pedir un servidor mejor:** no depende de nosotros; el software se adapta al hardware.

## Consecuencias

- ✅ Pope corre en el hardware que ya existe.
- ⚠️ Cada dependencia nueva del servidor o del panel debe justificar su peso en el plan.
- ⚠️ Instalar y actualizar requiere un instalador propio (script o MSI), no un solo
  `docker compose up`.

## Preguntas abiertas

- ¿Qué sistema operativo tiene hoy ese PC?
- ¿Disco SSD o mecánico?
- ¿Es exclusivo para Pope o lo usa también el encargado?
- ¿Cuántas PCs cliente hay en el local, y cuántas se esperan como máximo?
