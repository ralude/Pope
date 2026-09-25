# ADR-0005: Interfaz del Shell en React dentro de WebView2

- **Estado:** Propuesto
- **Fecha:** 2026-09-25
- **Relacionado:** ADR-0006, ADR-0009, spec 003

## Contexto

El Shell es lo que ve el cliente: login, tiempo restante, juegos y herramientas
permitidas, pausa, pedidos al mostrador. Debe verse bien, llevar la marca de cada
cibercafé y consumir poco, porque las PCs son para jugar. El mantenedor domina React y
TypeScript, no C#.

## Decisión

- La interfaz se escribe en **React + TypeScript** (`apps/shell-ui`) y se ejecuta dentro
  de **WebView2** (el Chromium de Edge que ya trae Windows).
- Un **host mínimo en C#** (`Pope.ShellHost`, ADR-0006) crea la ventana a pantalla
  completa, carga la interfaz y le expone un puente con pocas funciones:
  `launchApp(id)`, `requestPause()`, `getStatus()`, etc.
- La interfaz **no toca Windows directamente**: pide todo al host por el puente, y el
  host lo valida.

## Alternativas consideradas

| Opción | Motivo del descarte |
|---|---|
| **React Native for Windows** | Viable y ya genera apps Win32 con WinAppSDK. Pero las piezas difíciles (teclado, escritorio separado, procesos) siguen siendo nativas, tiene menos librerías compatibles y su toolchain (Visual Studio + C++) es más duro de depurar. No hay app móvil con la que compartir código (ADR-0012). Se puede reconsiderar más adelante. |
| **Electron** | 150–300 MB de RAM por PC, restados a los juegos, y los módulos nativos son frágiles. |
| **Tauri** | Ligero, pero la parte nativa sería en Rust, que el mantenedor tampoco conoce. |
| **WPF puro** | Toda la interfaz en C#/XAML: más lento de iterar para el mantenedor. |

## Consecuencias

- ✅ Interfaz moderna, personalizable, iterable con Vite y herramientas web.
- ✅ Puede reutilizar componentes y estilos del panel.
- ✅ El runtime de WebView2 viene incluido en Windows 11 y se actualiza solo.
- ⚠️ En **Windows 10 no está garantizado**: no venía de serie y Microsoft lo distribuyó
  después por Windows Update (desde 2021). Puede faltar en PCs sin actualizar o sin
  internet, en ediciones LTSC, en equipos con actualizaciones gestionadas (WSUS) o con
  congelador de disco. Por eso el instalador de Pope (REQ-003-50) debe comprobarlo e
  instalarlo si falta, con el **instalador completo sin conexión** de Microsoft (~150 MB),
  porque la conexión del local es inestable. Microsoft anunció soporte de WebView2 en
  Windows 10 hasta al menos 2028 (dato por confirmar en la spec 003).
- ⚠️ Consume unos 80–120 MB mientras está visible. Durante el juego se minimiza su
  actividad (sin animaciones, sin sondeos).
- ⚠️ **Riesgo a validar en el prototipo:** que WebView2 renderice correctamente en el
  escritorio alterno del bloqueo y la pausa (ADR-0009). Plan B: pantallas de bloqueo y
  pausa en WPF nativo, que son simples.
