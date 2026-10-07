# ADR-0019: Host del Shell en WinForms con WebView2

- **Estado:** Aceptado (mantenedor, 2026-10-07; opción A)
- **Fecha:** 2026-10-07
- **Relacionado:** ADR-0005, ADR-0006, ADR-0009, spec 003 (T08/T09)

## Contexto

El Shell ya tiene su interfaz en React y TypeScript. El mantenedor domina esas
tecnologías y necesita mantener el código C# pequeño. Falta elegir el framework de
la ventana que aloja WebView2; esa elección no cambia el diseño visual del Shell.

## Decisión

Usaremos **WinForms + el SDK oficial de WebView2** para `Pope.ShellHost`.
La ventana sin bordes aloja la interfaz React a pantalla completa. El host configura
la ventana, el ciclo de vida de WebView2 y el puente nativo; las reglas de negocio
siguen en TypeScript según ADR-0006/0007.

La elección concreta el host previsto en ADR-0005/0006 y conserva el escritorio
separado de ADR-0009. No sustituye el prototipo T09 ni confirma compatibilidad,
rendimiento o seguridad en las PCs del local. El inventario Windows sigue pendiente
antes de fijar versiones de SDK y herramientas.

## Alternativas consideradas

- **WPF + WebView2:** ofrece más herramientas para interfaces nativas complejas,
  pero el host previsto contiene una sola vista React y aprovecharía poco XAML,
  estilos y enlace de datos nativos. Se elige WinForms por simplicidad de mantenimiento.
- **WPF nativo para bloqueo/pausa si falla el prototipo:** continúa como respaldo
  previsto en ADR-0005; no se implementa por esta decisión. Un fallo en T09 exige
  revisar el plan antes de integrar las tareas dependientes.

## Consecuencias

- La interfaz React y sus estilos se conservan; WinForms es su contenedor de Windows.
- El host se puede mantener con una ventana y eventos, sin incorporar una interfaz
  completa en XAML.
- Si se necesitan muchas pantallas nativas complejas, habrá que revisar la elección.
  El respaldo WPF añadiría otro framework al host.
- Ambas opciones comparten WebView2: no se promete una reducción de memoria o
  latencia sin medir. T09 y la verificación real siguen siendo obligatorias.

Referencias: [WebView2 en WinForms](https://learn.microsoft.com/en-us/microsoft-edge/webview2/get-started/winforms),
[WebView2 en WPF](https://learn.microsoft.com/en-us/microsoft-edge/webview2/platforms/wpf).
