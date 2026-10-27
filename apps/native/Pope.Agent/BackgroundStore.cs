using System.Security.Cryptography;
using Pope.Bridge;

namespace Pope.Agent;

// REQ-003-73: la imagen del fondo solo aparece en la carpeta con su nombre definitivo cuando
// ya se comprobó su huella y su tamaño; antes vive en un temporal que siempre se borra.
internal sealed class BackgroundStore(string directory)
{
    // Los 2 MB (2 000 000 bytes) que fija REQ-003-76 para el WebP que sube el panel.
    internal const long MaximumBytes = 2_000_000;

    /// <summary>
    /// ¿Está ya <c>&lt;huella&gt;.webp</c> con el tamaño anunciado? Evita volver a descargar el mismo
    /// fondo en cada reconexión. La comprobación completa de la huella al arrancar es de la historia 5.
    /// </summary>
    internal bool Contains(string sha256, long size) =>
        BackgroundFiles.IsHash(sha256) && new FileInfo(Path.Combine(directory, sha256 + ".webp")) is { Exists: true } file && file.Length == size;

    /// <summary>
    /// Guarda <paramref name="content"/> como <c>&lt;huella&gt;.webp</c> si pesa exactamente
    /// <paramref name="size"/> bytes y su SHA-256 es <paramref name="sha256"/>. Si no, no deja nada.
    /// </summary>
    internal async Task InstallAsync(Stream content, string sha256, long size, CancellationToken token)
    {
        // La huella se convierte en nombre de archivo: se valida antes de tocar disco o descargar.
        if (!BackgroundFiles.IsHash(sha256) || size is < 1 or > MaximumBytes) throw new InvalidDataException("Fondo no válido.");
        var temporary = Path.Combine(directory, Guid.NewGuid().ToString("N") + ".tmp");
        try
        {
            using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
            long total = 0;
            using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                var buffer = new byte[16_384];
                int read;
                while ((read = await content.ReadAsync(buffer, token)) > 0)
                {
                    // Nunca se guarda más de lo anunciado: una fuente que no acaba no llena el disco.
                    total += read;
                    if (total > size) throw new InvalidDataException("Fondo no válido.");
                    hash.AppendData(buffer, 0, read);
                    await file.WriteAsync(buffer.AsMemory(0, read), token);
                }
                if (total != size) throw new InvalidDataException("Fondo no válido.");
                file.Flush(flushToDisk: true);
            }
            if (Convert.ToHexStringLower(hash.GetHashAndReset()) != sha256) throw new InvalidDataException("Fondo no válido.");
            File.Move(temporary, Path.Combine(directory, sha256 + ".webp"), overwrite: true);
            // Hasta aquí el fondo anterior seguía intacto; solo ahora que el nuevo está completo se
            // borra. Solo se tocan los archivos con forma de fondo (<huella>.webp), nunca otros.
            foreach (var path in Directory.EnumerateFiles(directory, "*.webp"))
                if (Path.GetFileNameWithoutExtension(path) is var name && name != sha256 && BackgroundFiles.IsHash(name))
                    File.Delete(path);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
}
