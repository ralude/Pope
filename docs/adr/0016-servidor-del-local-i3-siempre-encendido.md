# ADR-0016: El servidor del local es un i3-2120 con 8 GB, casi siempre encendido

- **Estado:** Propuesto
- **Fecha:** 2026-10-03
- **Relacionado:** ADR-0011 (lo reemplaza), ADR-0001, ADR-0004

## Contexto

ADR-0011 fijó el presupuesto de recursos del nodo local suponiendo un **Intel Core i5 de 2ª
generación** con 8 GB. El mantenedor corrige el dato (2026-10-03): el PC que alojará el nodo es
un **Intel Core i3-2120 con 8 GB de RAM**, de sobremesa (primero dijo i3 2310 y lo corrigió el
mismo día), que **rara vez se apaga o se reinicia** y que él describe como **extremadamente
lento**.

Lo que cambia frente a ADR-0011:

- **CPU:** también de 2ª generación (Sandy Bridge, 2011), pero de gama más baja: **2 núcleos y
  4 hilos** a 3,3 GHz, sin Turbo Boost, en vez de los 4 núcleos que se suponían. Mantiene AVX
  y tampoco tiene AVX2. La gráfica integrada es la misma HD 2000 que se suponía para el panel.
  PostgreSQL, el servidor Node y el navegador del panel (si el encargado lo usa en ese mismo
  PC) se reparten esos dos núcleos.
- **RAM:** igual, 8 GB.
- **Uso:** casi siempre encendido. Pope tiene que aguantar **semanas sin reiniciar** sin que
  crezca la memoria ni se llene el disco.

## Decisión

- El hardware de referencia del nodo local pasa a ser el **i3-2120 con 8 GB**. Todas las
  mediciones que hasta ahora decían "en el i5" (T11 y T37 de la spec 001, REQ-005-71 de la
  spec 005) se hacen en este PC.
- Se mantienen **sin cambios** el presupuesto y las reglas de ADR-0011: ~1 GB de RAM para Pope
  (PostgreSQL ≤ 512 MB, Node ≤ 384 MB), sin Docker, sin compilar en el nodo, binarios sin AVX2,
  y el objetivo de 40 PCs con p95 < 200 ms en la API. Si las mediciones en este PC no los
  cumplen, se propone otro ADR antes de relajarlos.
- Al estar casi siempre encendido, el nodo debe funcionar **sin reinicios programados**: la
  memoria del proceso tiene que quedarse estable en el tiempo (se vigila con
  `POPE_MEMORY_LOG_MS`) y nada puede crecer sin límite en disco ni en memoria (logs, cachés,
  colas).

## Alternativas consideradas

- **Editar ADR-0011:** los ADR no se reescriben (ADR-0000); este lo reemplaza.
- **Pedir otro PC para el servidor:** no depende de nosotros, como ya decía ADR-0011.
- **Bajar ya los objetivos de rendimiento:** sin medir en el PC real sería adivinar. Primero
  se mide y luego, si hace falta, se decide.

## Consecuencias

- ✅ Las mediciones pendientes ya apuntan al PC verdadero.
- ⚠️ Con dos núcleos, el trabajo pesado de CPU se nota más: el hash de contraseñas (argon2id,
  spec 001) y generar los PDF del cierre (spec 005) compiten con todo lo demás. Hay que medirlos
  en este PC.
- ⚠️ Si el encargado usa el panel en ese mismo PC, el navegador también compite por la CPU y
  la RAM: el panel tiene que seguir siendo ligero (ADR-0011).
- ⚠️ Un nodo que no se reinicia en semanas hace visible cualquier fuga de memoria. Hay que
  incluir en las mediciones una prueba larga, de horas, mirando la memoria.

## Preguntas abiertas

- Siguen abiertas las de ADR-0011: sistema operativo, disco SSD o mecánico, si lo usa también
  el encargado y cuántas PCs cliente hay.
