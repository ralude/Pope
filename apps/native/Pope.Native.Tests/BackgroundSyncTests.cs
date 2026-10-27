using System.Diagnostics;
using System.Text.Json;
using Pope.Agent;
using Pope.Bridge;
using Xunit;

namespace Pope.Native.Tests;

public sealed class BackgroundSyncTests : IDisposable
{
    // Vector estándar de SHA-256 (FIPS 180-2): el resumen de los tres bytes «abc».
    private const string AbcHash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    private static readonly byte[] Abc = "abc"u8.ToArray();

    private readonly string directory = Path.Combine(Path.GetTempPath(), "pope-sync-" + Guid.NewGuid().ToString("N"));
    private readonly BackgroundStore store;

    public BackgroundSyncTests()
    {
        Directory.CreateDirectory(directory);
        store = new BackgroundStore(directory);
    }

    public void Dispose() => Directory.Delete(directory, recursive: true);

    private string[] Files() => Directory.GetFiles(directory).Select(Path.GetFileName).Cast<string>().Order().ToArray();

    /// <summary>El aviso del nodo: solo metadatos, nunca los bytes de la imagen.</summary>
    private static JsonElement FromNode(int revision, string sha256 = AbcHash) => JsonSerializer.SerializeToElement(new
    {
        type = "lockBackground",
        revision,
        background = new { sha256, size = 3, mimeType = "image/webp", width = 1, height = 1 }
    });

    [Fact(DisplayName = "REQ-003-73/63: el host no recibe el lockBackground del nodo; solo el aviso del agente, con la imagen ya verificada")]
    public async Task HostIsToldOnlyOnceTheImageIsVerified()
    {
        using var configuration = AgentConfiguration.Parse(JsonSerializer.SerializeToUtf8Bytes(AgentConfigurationTests.Fixture()));
        var channel = new AgentChannel(configuration, new AgentLog(Path.GetTempPath()));
        using var bridge = new AgentHostBridge(channel, new AgentState(configuration.PcId), configuration.PcName); bridge.Subscribe();
        // La «descarga» espera a que la prueba la suelte y entonces instala la imagen de verdad.
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var sync = new BackgroundSync(async (sha, size, token) =>
        {
            await release.Task.WaitAsync(token);
            await store.InstallAsync(new MemoryStream(Abc), sha, size, token);
        }, bridge.PublishBackground);
        using var process = Process.GetCurrentProcess(); using var retained = new RetainedProcess(process);
        var name = PipeEndpoints.NewName(); using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var running = bridge.RunForHostAsync(process, name, stop.Token);
        try
        {
            using var client = await PipeEndpoints.Connect(name, retained, stop.Token);
            await PipeFrames.ReadAsync(client, "bridge-event", stop.Token); // estado offline
            var next = PipeFrames.ReadAsync(client, "bridge-event", stop.Token);

            // Llega el aviso del nodo, tal como lo recibiría el canal: lo ven el puente y la sincronización.
            var message = FromNode(1);
            bridge.OnMessage(message);
            sync.OnMessage(message);

            // Mientras se descarga, el host no sabe nada: ni el aviso crudo del nodo ni uno del agente.
            await Task.Delay(300);
            Assert.False(next.IsCompleted);
            Assert.Empty(Directory.GetFiles(directory));

            release.SetResult();
            await sync.Pending;
            var told = ProtocolValidation.Parse(await next, "bridge-event");
            Assert.Equal("message", told.GetProperty("kind").GetString());
            Assert.Equal("lockBackground", told.GetProperty("message").GetProperty("type").GetString());
            Assert.Equal(1, told.GetProperty("message").GetProperty("revision").GetInt32());
            Assert.Equal(AbcHash, told.GetProperty("message").GetProperty("background").GetProperty("sha256").GetString());
            // Y para cuando se avisa, la imagen ya está completa en la carpeta.
            Assert.Equal([AbcHash + ".webp"], Files());
        }
        finally { stop.Cancel(); try { await running; } catch (OperationCanceledException) { } }
    }

    [Fact(DisplayName = "REQ-003-72: un aviso sin imagen (valor inicial) llega al host de inmediato y no descarga nada")]
    public async Task NoImageIsToldWithoutDownloading()
    {
        var downloads = 0;
        var told = new List<JsonElement>();
        var sync = new BackgroundSync((_, _, _) => { downloads++; return Task.CompletedTask; }, told.Add, store.Contains);

        sync.OnMessage(JsonSerializer.SerializeToElement(new { type = "lockBackground", revision = 0, background = (object?)null }));
        await sync.Pending;

        Assert.Equal(0, downloads);
        var message = Assert.Single(told);
        Assert.Equal(0, message.GetProperty("revision").GetInt32());
        Assert.Equal(JsonValueKind.Null, message.GetProperty("background").ValueKind);
    }

    [Fact(DisplayName = "REQ-003-73/75: un fondo ya instalado no se vuelve a descargar, pero el host sí es avisado")]
    public async Task InstalledBackgroundIsNotDownloadedAgain()
    {
        // El nodo repite el aviso en cada hello: sin esto, cada reconexión volvería a bajar la imagen.
        await store.InstallAsync(new MemoryStream(Abc), AbcHash, 3, CancellationToken.None);
        var downloads = new List<string>();
        var told = new List<JsonElement>();
        var sync = new BackgroundSync((sha, _, _) => { downloads.Add(sha); return Task.CompletedTask; }, told.Add, store.Contains);

        sync.OnMessage(FromNode(1));
        await sync.Pending;
        Assert.Empty(downloads);
        Assert.Equal(1, Assert.Single(told).GetProperty("revision").GetInt32());

        // Otra huella que no está en la carpeta sí se descarga.
        var other = new string('b', 64);
        sync.OnMessage(FromNode(2, other));
        await sync.Pending;
        Assert.Equal([other], downloads);

        // Un archivo con ese nombre pero de otro tamaño no vale como el fondo anunciado.
        var broken = new string('c', 64);
        await File.WriteAllBytesAsync(Path.Combine(directory, broken + ".webp"), [1, 2, 3, 4, 5]);
        sync.OnMessage(FromNode(3, broken));
        await sync.Pending;
        Assert.Equal([other, broken], downloads);
    }

    [Fact(DisplayName = "REQ-003-73: si la descarga falla, el host no es avisado ni queda archivo, y el siguiente fondo bueno sí llega")]
    public async Task FailedDownloadNeverReachesHostAndDoesNotBlockTheNext()
    {
        using var configuration = AgentConfiguration.Parse(JsonSerializer.SerializeToUtf8Bytes(AgentConfigurationTests.Fixture()));
        var channel = new AgentChannel(configuration, new AgentLog(Path.GetTempPath()));
        using var bridge = new AgentHostBridge(channel, new AgentState(configuration.PcId), configuration.PcName); bridge.Subscribe();
        var attempts = 0;
        var sync = new BackgroundSync(async (sha, size, token) =>
        {
            // La primera descarga trae un contenido que no es el anunciado (huella distinta); la segunda, bueno.
            await store.InstallAsync(new MemoryStream(attempts++ == 0 ? "abd"u8.ToArray() : Abc), sha, size, token);
        }, bridge.PublishBackground);
        using var process = Process.GetCurrentProcess(); using var retained = new RetainedProcess(process);
        var name = PipeEndpoints.NewName(); using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var running = bridge.RunForHostAsync(process, name, stop.Token);
        try
        {
            using var client = await PipeEndpoints.Connect(name, retained, stop.Token);
            await PipeFrames.ReadAsync(client, "bridge-event", stop.Token); // estado offline
            var next = PipeFrames.ReadAsync(client, "bridge-event", stop.Token);

            sync.OnMessage(FromNode(1));
            await sync.Pending;
            await Task.Delay(200);
            Assert.False(next.IsCompleted);
            Assert.Empty(Directory.GetFiles(directory));

            sync.OnMessage(FromNode(2));
            await sync.Pending;
            var told = ProtocolValidation.Parse(await next, "bridge-event");
            Assert.Equal(2, told.GetProperty("message").GetProperty("revision").GetInt32());
            Assert.Equal([AbcHash + ".webp"], Files());
        }
        finally { stop.Cancel(); try { await running; } catch (OperationCanceledException) { } }
    }
}
