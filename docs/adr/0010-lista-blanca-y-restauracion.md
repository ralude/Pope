# ADR-0010: Lista blanca de aplicaciones y restauración de configuración

- **Estado:** Propuesto
- **Fecha:** 2026-09-25
- **Relacionado:** ADR-0006, spec 004

## Contexto

El cliente debe poder abrir juegos y algunas herramientas (Configuración de Windows para
el ratón o el sonido, Razer Synapse, Logitech G Hub, etc.) sin escapar del Shell. Todos
los clientes comparten el mismo usuario local de Windows, así que lo que cambie uno (DPI,
sensibilidad, volumen) le queda al siguiente.

## Decisión

**Lista blanca definida en el nodo central.** El encargado la gestiona desde el panel y
cada entrada define:
- Ruta del ejecutable y, cuando exista, el **editor de la firma digital** (p. ej.
  "Razer Inc."), para permitir los procesos auxiliares del mismo fabricante.
- Categoría (juego o herramienta), icono y argumentos.
- Rutas de configuración a restaurar al cerrar la sesión.
- Vías de escape conocidas y cómo se mitigan.

**Aplicación en dos capas:**
1. El Shell solo muestra y lanza las apps de la lista.
2. `Pope.Agent` vigila cada proceso nuevo de la sesión del cliente y **termina al
   instante** los que no estén permitidos (`explorer.exe`, `cmd`, navegadores no
   permitidos, etc.).

**Configuración de Windows limitada** con la directiva `SettingsPageVisibility`
(`showonly:mousetouchpad;display;sound;...`, lista configurable). Directivas
adicionales: sin Administrador de tareas, sin Ejecutar, sin `cmd` ni `regedit` y unidades
ocultas en los diálogos de archivo.

**Restauración al cerrar la sesión:** antes de cada sesión, el agente guarda una
instantánea de las claves del registro (`HKCU\Control Panel\Mouse`, etc.) y de las
carpetas de configuración declaradas en la lista blanca. Al terminar, la restaura.

## Alternativas consideradas

- **AppLocker o WDAC como única barrera:** su disponibilidad y aplicación varían según la
  edición de Windows (Pro frente a Enterprise). Queda como refuerzo opcional; la barrera
  base es el agente.
- **Congelar el disco (tipo Deep Freeze) para restaurar:** restaura todo al reiniciar,
  pero no entre sesiones sin reiniciar la PC.
- **Perfil guardado por cuenta en el servidor:** mejor experiencia; se deja para una
  spec posterior.

## Consecuencias

- ✅ El cliente puede ajustar su ratón y su audio sin tener acceso al sistema.
- ✅ Cada cliente empieza con la configuración por defecto del local.
- ⚠️ Cada programa permitido abre vías de escape nuevas (enlaces que abren el navegador,
  diálogos de abrir archivo). Hay que revisarlo programa por programa.
- ⚠️ Algunos ratones guardan el DPI en su **memoria interna**. Restaurar archivos no lo
  revierte; hará falta reaplicar el perfil por defecto del programa. Se estudiará en la
  spec 004.
