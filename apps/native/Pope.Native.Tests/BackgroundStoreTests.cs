using System.Text;
using Pope.Agent;
using Xunit;

namespace Pope.Native.Tests;

public sealed class BackgroundStoreTests : IDisposable
{
    // Vector estándar de SHA-256 (FIPS 180-2): el resumen de los tres bytes «abc».
    private const string AbcHash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    private static readonly byte[] Abc = "abc"u8.ToArray();

    // La carpeta de fondos va dentro de otra, para comprobar que nada se escribe fuera de ella.
    private readonly string parent = Path.Combine(Path.GetTempPath(), "pope-background-" + Guid.NewGuid().ToString("N"));
    private readonly string directory;
    private readonly BackgroundStore store;

    public BackgroundStoreTests()
    {
        directory = Path.Combine(parent, "Background");
        Directory.CreateDirectory(directory);
        store = new BackgroundStore(directory);
    }

    public void Dispose() => Directory.Delete(parent, recursive: true);

    private string[] Files() => Directory.GetFileSystemEntries(directory).Select(Path.GetFileName).Cast<string>().Order().ToArray();

    [Fact(DisplayName = "REQ-003-73: una imagen con la huella y el tamaño anunciados se guarda como <huella>.webp")]
    public async Task InstallsVerifiedImage()
    {
        await store.InstallAsync(new MemoryStream(Abc), AbcHash, 3, CancellationToken.None);

        Assert.Equal([AbcHash + ".webp"], Files());
        Assert.Equal(Abc, await File.ReadAllBytesAsync(Path.Combine(directory, AbcHash + ".webp")));
    }

    [Fact(DisplayName = "REQ-003-73: una huella o un tamaño que no coincide no renombra ni deja archivos")]
    public async Task RejectsMismatchWithoutLeavingFiles()
    {
        // Contenido distinto del anunciado: la huella no coincide.
        await Assert.ThrowsAsync<InvalidDataException>(() => store.InstallAsync(new MemoryStream("abd"u8.ToArray()), AbcHash, 3, CancellationToken.None));
        // Llegan menos bytes de los anunciados (descarga cortada) y más bytes de los anunciados.
        await Assert.ThrowsAsync<InvalidDataException>(() => store.InstallAsync(new MemoryStream(Abc), AbcHash, 4, CancellationToken.None));
        await Assert.ThrowsAsync<InvalidDataException>(() => store.InstallAsync(new MemoryStream(Abc), AbcHash, 2, CancellationToken.None));
        Assert.Empty(Files());
    }

    // Segundo vector estándar de SHA-256 (FIPS 180-2): el mensaje de 448 bits (56 bytes).
    private const string LongHash = "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1";
    private static readonly byte[] Long = "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"u8.ToArray();

    [Fact(DisplayName = "REQ-003-73: un fondo nuevo sustituye al anterior y borra su archivo; un intento fallido lo conserva")]
    public async Task ReplacesPreviousBackground()
    {
        // Un archivo ajeno en la carpeta no es un fondo: nunca se toca.
        await File.WriteAllTextAsync(Path.Combine(directory, "nota.txt"), "no es un fondo");
        await store.InstallAsync(new MemoryStream(Abc), AbcHash, 3, CancellationToken.None);

        // El fondo nuevo no llega entero (huella que no coincide): el anterior sigue ahí.
        await Assert.ThrowsAsync<InvalidDataException>(() => store.InstallAsync(new MemoryStream(Abc), LongHash, 3, CancellationToken.None));
        Assert.Equal([AbcHash + ".webp", "nota.txt"], Files());

        // Verificado el nuevo, el anterior se borra: queda un solo fondo.
        await store.InstallAsync(new MemoryStream(Long), LongHash, Long.Length, CancellationToken.None);
        Assert.Equal([LongHash + ".webp", "nota.txt"], Files());
        Assert.Equal(Long, await File.ReadAllBytesAsync(Path.Combine(directory, LongHash + ".webp")));

        // Volver a instalar el mismo fondo no lo borra a sí mismo.
        await store.InstallAsync(new MemoryStream(Long), LongHash, Long.Length, CancellationToken.None);
        Assert.Equal([LongHash + ".webp", "nota.txt"], Files());
    }

    [Fact(DisplayName = "REQ-003-63/73: huella no válida o tamaño fuera de límites se rechaza sin leer el contenido ni escribir fuera")]
    public async Task RejectsInvalidAnnouncementBeforeReading()
    {
        var unreadable = new UnreadableStream();
        foreach (var hash in new[] { "../Background2/" + AbcHash, AbcHash.ToUpperInvariant(), AbcHash[..63], "" })
            await Assert.ThrowsAsync<InvalidDataException>(() => store.InstallAsync(unreadable, hash, 3, CancellationToken.None));
        // Más de 2 MB (2 000 000 bytes) o vacío no es un fondo válido.
        await Assert.ThrowsAsync<InvalidDataException>(() => store.InstallAsync(unreadable, AbcHash, 2_000_001, CancellationToken.None));
        await Assert.ThrowsAsync<InvalidDataException>(() => store.InstallAsync(unreadable, AbcHash, 0, CancellationToken.None));

        Assert.Empty(Files());
        Assert.Equal([directory], Directory.GetFileSystemEntries(parent));
    }

    /// <summary>Un flujo que falla si alguien lo lee: prueba que se rechazó antes de descargar.</summary>
    private sealed class UnreadableStream : Stream
    {
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() { }
        public override int Read(byte[] buffer, int offset, int count) => throw new InvalidOperationException("No se debía leer.");
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}
