# ADR-0009: Bloqueo y pausa en un escritorio Win32 separado

- **Estado:** Aceptado (mantenedor, 2026-10-04)
- **Fecha:** 2026-09-25
- **Relacionado:** ADR-0005, ADR-0006, spec 002, spec 003

## Contexto

Cuando la PC está bloqueada (sin sesión) o en pausa, el cliente no debe poder usar nada.
Una ventana "siempre encima" no basta: los juegos a pantalla completa exclusiva se dibujan
por encima, y con Alt+Tab o atajos se puede volver al juego.

## Decisión

- `Pope.ShellHost` crea un escritorio Win32 propio (`CreateDesktop`, p. ej.
  `PopeLock`) y cambia a él con `SwitchDesktop`. Es la misma técnica que usa Windows para
  la ventana de permisos de administrador (UAC).
- En ese escritorio solo existe la ventana de Pope. **El teclado y el ratón solo llegan
  al escritorio activo**, así que los juegos y apps del escritorio normal no reciben nada.
- Las aplicaciones del cliente **siguen ejecutándose** en el escritorio normal durante la
  pausa; no se suspenden. Al reanudar, se vuelve con `SwitchDesktop` al escritorio normal.
- Ctrl+Alt+Supr no se puede interceptar (lo gestiona Winlogon). Sus opciones se recortan
  con directivas: sin Administrador de tareas, sin cambiar de usuario, sin cerrar sesión.

## Alternativas consideradas

- **Ventana a pantalla completa "siempre encima":** los juegos en pantalla completa
  exclusiva la tapan.
- **Suspender los procesos del cliente:** los juegos online se desconectan y algunos
  anticheats lo detectan como manipulación.
- **Cerrar la sesión de Windows:** se perdería todo lo abierto; no sirve para la pausa.

## Consecuencias

- ✅ Bloqueo robusto frente a juegos, atajos y ventanas superpuestas.
- ✅ Pausa sin cerrar ni congelar lo que el cliente tenía abierto.
- ⚠️ Un juego online sigue conectado y puede expulsar al jugador por inactividad. La
  interfaz lo avisa antes de pausar.
- ⚠️ Algunos juegos en pantalla completa exclusiva pierden el dispositivo gráfico al
  cambiar de escritorio y tardan en recuperarlo. Se validará con los juegos del local.
