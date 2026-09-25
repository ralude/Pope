# ADR-0001: Arquitectura local-first con copia en la nube

- **Estado:** Aceptado
- **Fecha:** 2026-09-25
- **Relacionado:** ADR-0007, ADR-0008, ADR-0011, ADR-0012

## Contexto

- El cibercafé está en Venezuela, donde son frecuentes los cortes de internet y de luz.
- El dueño vive en España y necesita ver el local en remoto: PCs ocupadas, sesiones
  abiertas y quién las abrió, caja e inventario.
- SENET es 100 % nube: sin internet, el local no puede cobrar ni abrir sesiones.

## Decisión

Dos niveles:

1. **Nodo local** (un PC del cibercafé, en la LAN): opera todo el negocio. Autentica
   cuentas, abre, pausa y cierra sesiones, cobra, vende y mueve stock. Las PCs cliente
   solo hablan con él.
2. **Nube**: recibe una copia de lo que pasa en el local (ADR-0008) y sirve la web del
   dueño (ADR-0012). **No forma parte de la ruta crítica** del local.

La primera versión es **unidireccional**: el local envía y la nube lee. Las acciones
remotas del dueño (p. ej. cerrar una sesión desde España) requieren un ADR nuevo.

## Alternativas consideradas

- **Solo nube (como SENET):** cada corte de internet paraliza el local. Inaceptable en
  este contexto.
- **Solo local con acceso remoto por VPN o escritorio remoto:** depende de que el local
  esté en línea justo cuando el dueño mira, expone la red del local y no escala a varias
  sucursales.

## Consecuencias

- ✅ El local sigue funcionando sin internet.
- ✅ El dueño consulta desde cualquier sitio, aunque el local esté caído (verá la última
  información sincronizada).
- ✅ Queda preparado para varias sucursales: cada una tiene su nodo local.
- ⚠️ Durante un corte, la web del dueño muestra datos atrasados. Debe indicar siempre
  "última actualización hace X".
- ⚠️ Hay dos despliegues que mantener (local y nube). Se mitiga con el mismo código en
  dos modos (ADR-0003).
