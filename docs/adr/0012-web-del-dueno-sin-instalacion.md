# ADR-0012: La web del dueño es solo navegador, sin instalación

- **Estado:** Aceptado
- **Fecha:** 2026-09-25
- **Relacionado:** ADR-0001, ADR-0008, spec 006

## Contexto

El dueño consulta el local desde el móvil (hoy lo hace con SENET). Prefiere entrar sin
instalar nada, desde cualquier dispositivo.

## Decisión

- La vista del dueño es una **aplicación web** servida desde la nube, diseñada primero
  para móvil y que funcione en cualquier navegador moderno.
- **No habrá app nativa** ni publicación en tiendas.
- Se permite que sea instalable como PWA ("Añadir a pantalla de inicio"), pero **nunca
  será obligatorio** instalarla para usar ninguna función.
- Se construye con el mismo código que el panel del encargado (`apps/panel`), pero con
  rutas y permisos de dueño.

## Alternativas consideradas

- **App nativa con Expo / React Native:** exige instalar y actualizar desde las tiendas.
  El dueño no lo quiere.

## Consecuencias

- ✅ Acceso inmediato desde cualquier dispositivo con un enlace.
- ✅ Una sola base de código de interfaz para encargado y dueño.
- ⚠️ Las notificaciones push web en iPhone solo funcionan si la web se añade a la
  pantalla de inicio. Las alertas críticas deberán tener otro canal (correo o
  mensajería); se decidirá en la spec 006.
- ⚠️ La sesión del dueño da acceso a datos financieros: login robusto y 2FA (TOTP)
  recomendados.
