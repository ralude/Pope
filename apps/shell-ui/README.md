# Shell de Pope

En producción el host empaqueta esta interfaz y sus fuentes. React usa exclusivamente
`chrome.webview`: sin WebView2 muestra desconexión. No abre WebSocket ni posee la
credencial de PC; el agente mantiene la conexión, el tiempo autorizado y los latidos.
El origen del paquete aplica CSP que prohíbe conexiones directas desde JavaScript.

## Desarrollo en navegador

Registrar una PC de pruebas según [el simulador](../../tools/agent-sim/README.md).
No usar la configuración privada del servicio Windows. Con el nodo arrancado:

```powershell
$env:POPE_SIM_PROFILE = 'C:/ruta/privada/local.sim-secret.json'
$env:POPE_SIM_PC = '1'
pnpm --filter @pope/shell-ui dev
```

Abrir `http://127.0.0.1:5174`. El número selecciona una entrada registrada del perfil;
UUID/nombre los asignó el nodo. Vite escucha solo en loopback, verifica CA/nombre de
TLS y añade Bearer al upgrade del origen local; JavaScript recibe solo la identidad
pública. Sin perfil no se configura proxy de PCs y la pantalla queda desconectada.
Nunca introducir credenciales en variables `VITE_*`, argumentos, URLs ni archivos
versionados. `?pc=` ya no selecciona una PC ficticia; cada proceso Vite usa una PC.

El transporte DEV usa v2 y recuperación unknown, conserva estado de pausa y se detiene
ante revocación. Se excluye del build de producción. El host local se construye con
`pnpm build`; la instalación/supervisión del Shell Windows siguen en tareas posteriores.
