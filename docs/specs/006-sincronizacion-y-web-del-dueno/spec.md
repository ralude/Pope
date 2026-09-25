# Spec 006: Sincronización con la nube y web del dueño

- **Estado:** Borrador
- **Fecha:** 2026-09-25
- **ADRs relacionados:** ADR-0001, ADR-0003, ADR-0008, ADR-0012
- **Specs relacionadas:** 001, 002, 003, 005

## Problema

El dueño vive en España y el local está en Venezuela. Necesita ver desde el móvil, sin
instalar nada, qué pasa en el local: qué PCs se usan, qué sesiones abrió cada encargado,
cuánto se vendió y si la caja cuadra.

## Actores

- **Dueño:** consulta desde el navegador.
- **Sistema:** el nodo local envía eventos y la nube construye las vistas.

## Historias de usuario

- Como **dueño**, quiero abrir un enlace en el móvil y ver al momento cuántas PCs están en uso.
- Como **dueño**, quiero ver qué sesiones abrió cada encargado para detectar sesiones regaladas.
- Como **dueño**, quiero revisar cada cierre de caja y sus diferencias.
- Como **dueño**, quiero saber si los datos que veo están al día o el local se quedó sin internet.

## Requisitos funcionales

**Sincronización**
- **REQ-006-01:** El nodo local envía a la nube todos los eventos según ADR-0008, en orden, sin pérdidas ni duplicados.
- **REQ-006-02:** Tras un corte de internet de cualquier duración, el nodo envía lo acumulado al reconectar.
- **REQ-006-03:** Cada nodo local se autentica con una credencial de sucursal que el dueño puede revocar.

**Web del dueño** (solo lectura en esta versión)
- **REQ-006-10:** Login con usuario, contraseña y **2FA (TOTP)**.
- **REQ-006-11:** **Estado en vivo:** PCs libres, en uso, en pausa, sin conexión y en mantenimiento, con el porcentaje de ocupación.
- **REQ-006-12:** **Sesiones activas:** PC, cliente o nombre de la sesión temporal, **quién la abrió** (el cliente o el encargado X), hora de inicio y tiempo consumido.
- **REQ-006-13:** **Historial de sesiones** filtrable por fecha, PC, encargado y motivo de cierre.
- **REQ-006-14:** **Ocupación** por hora del día y por día de la semana.
- **REQ-006-15:** **Caja:** turnos con encargado, esperado, contado y diferencia por moneda.
- **REQ-006-16:** **Ventas e inventario:** ventas del día, productos más vendidos, stock actual y alertas de stock bajo.
- **REQ-006-17:** **Auditoría del personal:** recargas, sesiones temporales, **restauraciones de sesiones interrumpidas**, anulaciones, ajustes de stock, cambios de precio y modos mantenimiento, por encargado.
- **REQ-006-18:** Cada pantalla muestra **"Última actualización del local: hace X"**, y un aviso visible si pasan más de 5 minutos.
- **REQ-006-19:** Las horas se muestran en la zona horaria del navegador del dueño, indicando también la hora del local.

**Preparado para varias sucursales**
- **REQ-006-30:** El modelo de datos de la nube distingue sucursales desde el principio, aunque al empezar solo haya una.

## Requisitos no funcionales

- **REQ-006-50:** Con internet en el local, un evento aparece en la web en < 60 s.
- **REQ-006-51:** Diseño primero para móvil. La carga inicial debe ser usable con 4G lenta (JavaScript inicial < 250 KB comprimido).
- **REQ-006-52:** Funciona en los navegadores móviles actuales sin instalar nada (ADR-0012).
- **REQ-006-53:** El proceso de sincronización del nodo local respeta el presupuesto del ADR-0011.

## Criterios de aceptación

- **CA-006-01** (REQ-006-02)
  - **Dado** el local sin internet durante 3 horas, con actividad normal
  - **Cuando** vuelve la conexión
  - **Entonces** la web muestra toda la actividad de esas 3 horas, sin duplicados, en < 5 min.
- **CA-006-02** (REQ-006-12)
  - **Dado** que el encargado Ana abrió la sesión temporal "Carlos" en la PC 05
  - **Entonces** el dueño la ve como "PC 05 · Carlos · abierta por Ana".
- **CA-006-03** (REQ-006-18)
  - **Dado** que el local lleva 20 min sin internet
  - **Entonces** la web muestra "Sin datos nuevos del local desde hace 20 min".

## Fuera de alcance

- Acciones remotas del dueño (cerrar sesiones, cambiar precios): requieren un ADR nuevo.
- Varias sucursales en la interfaz (el modelo ya lo soporta).
- Exportar a Excel o PDF.

## Preguntas abiertas

- [ ] ¿Por qué canal quiere el dueño las **alertas** (diferencia de caja, stock bajo, local desconectado): correo, Telegram, WhatsApp o push web?
- [ ] ¿Hay más personas, además del dueño, que deban acceder a la web (socio, contador)?
- [ ] ¿Qué proveedor de nube se prefiere, y hay presupuesto mensual objetivo?
