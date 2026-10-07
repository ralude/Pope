# ADR-0023: Alt+Tab disponible con una sesión de cliente

- **Estado:** Aceptado (mantenedor, 2026-10-07)
- **Fecha:** 2026-10-07
- **Relacionado:** ADR-0005, ADR-0006, ADR-0009, spec 003 (REQ-003-30, T21/T25)

## Contexto

REQ-003-30 inhibía Alt+Tab siempre que Pope estuviera en primer plano. El mantenedor
indica bloquearlo solo sin sesión de cliente y permitirlo con temporal o cuenta.
Se necesita volver a Pope desde el juego sin aprender otro atajo y regresar al juego.

## Decisión

- Sin sesión de cliente, Pope inhibe Alt+Tab en el bloqueo.
- Con sesión temporal o de cuenta, no lo inhibe por tener Pope en primer plano.
  En uso activo alterna entre Pope y ventanas autorizadas del escritorio de uso,
  sin pausar automáticamente. Las temporales siguen sin poder pausar (REQ-002-11).
- Pausa y revocación conservan su aislamiento: habilitar Alt+Tab no cambia de
  escritorio Win32 ni permite llegar al juego. Se requiere reanudar o autorizar
  continuar. Se conserva ADR-0009, sin depender de inhibir el atajo para aislar entradas.

T09/T25 deben probar la ventana de Pope seleccionable por Alt+Tab sin `explorer.exe`,
con juegos exclusivos/anticheat. No se da por disponible el selector nativo antes de
esa prueba ni se inicia Explorer como solución. Si falla, revisar el diseño del
selector manteniendo este comportamiento antes de integrar tareas dependientes.

## Alternativas consideradas

- **Ctrl+Shift+P o F10 como acceso principal:** exigen aprender otro atajo; el
  mantenedor elige Alt+Tab. No se fijan por las opciones anteriores.
- **Inhibir Alt+Tab al enfocar Pope durante una sesión:** impediría regresar al juego
  con la misma combinación; el mantenedor retira esa restricción.

## Consecuencias

- El filtro depende de la existencia de sesión, no solo del foco de Pope.
- T21/T25 y CA-003-12 deben probar ambos tipos de sesión, ida/vuelta y ausencia de
  acceso al juego desde pausa/revocación. Apps permitidas y sus escapes siguen en 004.
- Compatibilidad y selector pendientes de prueba; T08–T59 siguen en Borrador.

Referencias: [Alt+Tab en Windows](https://support.microsoft.com/en-us/windows/how-to-multitask-in-windows-b4fa0333-98f8-ef43-e25c-06d4fb1d6960),
[escritorios Win32](https://learn.microsoft.com/en-us/windows/win32/winstation/desktops).
