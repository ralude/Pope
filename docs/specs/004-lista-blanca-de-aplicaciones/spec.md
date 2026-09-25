# Spec 004: Lista blanca de aplicaciones y herramientas

- **Estado:** Borrador
- **Fecha:** 2026-09-25
- **ADRs relacionados:** ADR-0006, ADR-0010
- **Specs relacionadas:** 003

## Problema

El cliente necesita abrir juegos y algunas herramientas: la Configuración de Windows
para ajustar el ratón, el sonido o la pantalla, y programas de periféricos como Razer
Synapse para cambiar el DPI. Nada de eso debe servirle para escapar del Shell. Además, lo
que ajuste un cliente no debe quedarle al siguiente.

## Actores

- **Cliente:** abre juegos y herramientas.
- **Administrador del local:** gestiona el catálogo.
- **Sistema:** el agente aplica la lista y restaura la configuración.

## Historias de usuario

- Como **cliente**, quiero cambiar el DPI de mi ratón con Synapse y la sensibilidad en Configuración.
- Como **administrador**, quiero decidir qué programas se pueden abrir sin tocar cada PC.
- Como **cliente**, quiero encontrar la PC con la configuración por defecto, no con la del anterior.

## Requisitos funcionales

**Catálogo**
- **REQ-004-01:** El administrador gestiona desde el panel un catálogo con: nombre, categoría (juego o herramienta), icono, ruta del ejecutable, argumentos, editor de la firma digital (opcional), grupos de PC donde aparece y rutas de configuración a restaurar.
- **REQ-004-02:** El catálogo se distribuye automáticamente a las PCs del grupo.
- **REQ-004-03:** El Shell muestra el catálogo por categorías con buscador y solo lanza lo que está en él.
- **REQ-004-04:** Pope incluye plantillas predefinidas para Razer Synapse, Logitech G Hub, SteelSeries GG y Corsair iCUE, con sus procesos auxiliares y rutas de configuración.

**Configuración de Windows**
- **REQ-004-10:** La entrada "Configuración de Windows" solo muestra las páginas permitidas (directiva `SettingsPageVisibility`). Por defecto: ratón, pantalla, sonido y teclado.
- **REQ-004-11:** El administrador puede cambiar la lista de páginas permitidas.

**Aplicación de la lista**
- **REQ-004-20:** El agente detecta cada proceso nuevo en la sesión del cliente y termina en < 1 s los que no estén permitidos, ni sean procesos de sistema, ni auxiliares firmados por un editor permitido.
- **REQ-004-21:** Cada proceso terminado genera un evento. Si una PC acumula 5 intentos en 10 minutos, el panel avisa al encargado.
- **REQ-004-22:** Las directivas ocultan las unidades de disco en los diálogos de abrir y guardar, y desactivan Ejecutar, `cmd` y `regedit`.

**Restauración**
- **REQ-004-30:** Al iniciar sesión, el agente guarda una instantánea de las claves de registro de ratón, teclado y sonido, y de las rutas de configuración del catálogo.
- **REQ-004-31:** Al cerrar la sesión (por cualquier motivo), el agente restaura la instantánea antes de mostrar la pantalla de bloqueo.

**Vías de escape**
- **REQ-004-40:** Cada entrada del catálogo documenta sus vías de escape conocidas (enlaces al navegador, diálogos de archivo, consolas internas) y su mitigación. Una entrada sin esa revisión no se puede activar.

## Requisitos no funcionales

- **REQ-004-50:** La vigilancia de procesos consume < 2 % de CPU con la PC en juego.
- **REQ-004-51:** La restauración tarda < 5 s.

## Criterios de aceptación

- **CA-004-01** (REQ-004-10)
  - **Dado** un cliente que abre Configuración desde el Shell
  - **Entonces** solo ve las páginas de ratón, pantalla, sonido y teclado, y no puede llegar a Red, Cuentas ni Windows Update.
- **CA-004-02** (REQ-004-20)
  - **Dado** un cliente que abre un diálogo de archivo dentro de un programa permitido
  - **Cuando** intenta ejecutar `cmd.exe` desde ahí
  - **Entonces** el proceso se termina en < 1 s y se registra el intento.
- **CA-004-03** (REQ-004-31)
  - **Dado** un cliente que cambió la sensibilidad del ratón
  - **Cuando** su sesión termina
  - **Entonces** el siguiente cliente encuentra la sensibilidad por defecto.

## Fuera de alcance

- Perfil de configuración guardado por cuenta (una spec futura).
- Instalación y actualización de juegos desde el panel.

## Preguntas abiertas

- [ ] ¿Se permite un **navegador**? Es la mayor vía de escape (descargas, diálogos de archivo).
- [ ] Los lanzadores de juegos (Steam, Epic, Riot) incluyen un navegador interno: ¿cómo se tratan?
- [ ] Algunos ratones guardan el DPI en su **memoria interna**: ¿reaplicar el perfil por defecto al cerrar sesión, o aceptarlo?
- [ ] ¿Qué periféricos y programas hay en el local hoy?
