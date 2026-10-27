namespace Pope.Bridge;

// REQ-003-63/73: la huella que llega del nodo se usa como nombre de archivo en la carpeta de
// fondos, así que solo vale lo que no puede salirse de ella: 64 hexadecimales ASCII en minúscula.
internal static class BackgroundFiles
{
    internal const int HashLength = 64;

    // Carpeta de los fondos: la crea y escribe el agente (SYSTEM) y la lee el host. Una sola ruta para los dos.
    internal static string DefaultDirectory =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Pope", "Background");

    internal static bool IsHash(string? value) =>
        value is { Length: HashLength } && value.All(c => c is (>= '0' and <= '9') or (>= 'a' and <= 'f'));
}
