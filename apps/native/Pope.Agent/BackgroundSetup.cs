using System.Text.Json;
using Pope.Bridge;

namespace Pope.Agent;

// REQ-003-73: une las piezas del fondo (carpeta, almacén, descargador y sincronización) para que el
// runtime solo tenga que suscribirlo. Se separa para poder probar el cableado sin arrancar el servicio.
internal static class BackgroundSetup
{
    /// <summary>
    /// El servicio de producción guarda los fondos en %ProgramData%\Pope\Background, donde también los
    /// lee el host. Los servicios de prueba del SCM (otra raíz) usan una subcarpeta de la suya.
    /// </summary>
    internal static string DirectoryFor(string root) =>
        string.Equals(Path.GetFullPath(root).TrimEnd('\\'), Path.GetFullPath(AgentService.Root).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)
            ? BackgroundFiles.DefaultDirectory
            : Path.Combine(root, "Background");

    /// <summary>
    /// Prepara la carpeta y devuelve la sincronización, o <c>null</c> si la carpeta no es la esperada: sin
    /// fondo personalizado el Shell usa el de Pope, que es mejor que escribir en un sitio no protegido.
    /// </summary>
    /// <param name="prepare">Crea y verifica la carpeta; las pruebas, que no son SYSTEM, la sustituyen.</param>
    /// <param name="current">La configuración vigente en cada descarga: tras una revocación cambia (T34).</param>
    /// <param name="handler">Solo para las pruebas: en producto es siempre el transporte fijado.</param>
    internal static BackgroundSync? Create(string directory, Action<string> prepare, Func<AgentConfiguration> current,
        Action<JsonElement> applied, AgentLog log, Func<HttpMessageHandler?>? handler = null)
    {
        try { prepare(directory); }
        catch (Exception)
        {
            log.Write(AgentLogCode.BackgroundFolderRejected);
            return null;
        }
        var store = new BackgroundStore(directory);
        return new BackgroundSync(
            (sha256, size, token) => new BackgroundDownloader(current(), store, handler?.Invoke()).DownloadAsync(sha256, size, token),
            applied, store.Contains);
    }
}
