# ADR-0006: Agente y host nativos en C# (.NET), reducidos al mínimo

- **Estado:** Aceptado
- **Fecha:** 2026-09-25
- **Relacionado:** ADR-0005, ADR-0009, ADR-0010, spec 003

## Contexto

Hay funciones que solo se pueden hacer con APIs nativas de Windows: arrancar antes del
login, sobrevivir a que el usuario cierre procesos, bloquear el teclado, cambiar de
escritorio y vigilar procesos. El mantenedor eligió un stack híbrido: TypeScript para
todo lo demás y C# solo donde Windows lo exige.

## Decisión

Una solución .NET (versión LTS vigente) en `apps/native` con dos ejecutables:

**`Pope.Agent`**: servicio de Windows que corre como `LocalSystem` (sesión 0, sin
interfaz):
- Se conecta al nodo local por WebSocket, envía latidos y recibe órdenes.
- Vigila el arranque de procesos y termina los que no estén en la lista blanca
  (ADR-0010).
- Relanza `Pope.ShellHost` en la sesión del usuario si alguien lo cierra.
- Restaura la configuración de Windows y de los programas al cerrar la sesión
  (ADR-0010).

**`Pope.ShellHost`**: proceso en la sesión del usuario restringido, que arranca como su
shell en lugar de `explorer.exe`:
- Aloja WebView2 con `shell-ui` (ADR-0005).
- Instala el hook de teclado de bajo nivel (tecla Windows, Alt+Tab, etc.).
- Crea y cambia al escritorio de bloqueo y de pausa (ADR-0009).
- Lanza las apps permitidas en el escritorio normal.

El agente y el host se comunican por **named pipe** con permisos restringidos.

**Reglas de código** (el mantenedor no sabe C#):
- Cero lógica de negocio: tarifas, saldos y reglas de pausa viven en el servidor y en
  `packages/shared`.
- Cada llamada P/Invoke o Win32 lleva un comentario que explica qué hace y por qué.
- Solo biblioteca estándar de .NET y el SDK de WebView2, salvo que se justifique otra.
- Se publica como ejecutable autocontenido para no depender de un runtime instalado.

## Alternativas consideradas

- **Agente en Node.js con FFI (koffi):** posible, pero un servicio de sistema en Node con
  hooks y escritorios vía FFI es frágil y más difícil de depurar que en C#.
- **Rust o Go:** buenos para servicios, pero tampoco los conoce el mantenedor, y C# tiene
  la mejor documentación para Win32 y WebView2.

## Consecuencias

- ✅ Acceso completo y bien documentado a Windows.
- ✅ La superficie en C# es pequeña y acotada.
- ⚠️ El mantenedor depende de los comentarios y de la IA para esta parte; por eso debe ser
  mínima y muy explicada.
- ⚠️ Objetivo de consumo: agente < 50 MB y host < 60 MB (sin contar WebView2).
