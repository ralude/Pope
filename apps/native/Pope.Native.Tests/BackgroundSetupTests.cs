using System.Net;
using System.Text.Json;
using Pope.Agent;
using Pope.Bridge;
using Xunit;

namespace Pope.Native.Tests;

public sealed class BackgroundSetupTests : IDisposable
{
    // Vectores estándar de SHA-256 (FIPS 180-2): «abc» y el mensaje de 56 bytes.
    private const string AbcHash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    private const string LongHash = "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1";
    private static readonly byte[] Abc = "abc"u8.ToArray();
    private static readonly byte[] Long = "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"u8.ToArray();

    private readonly string root = Path.Combine(Path.GetTempPath(), "pope-setup-" + Guid.NewGuid().ToString("N"));
    private string Folder => Path.Combine(root, "Background");

    public BackgroundSetupTests() => Directory.CreateDirectory(Folder);

    public void Dispose() => Directory.Delete(root, recursive: true);

    private static AgentConfiguration Configuration() => AgentConfiguration.Parse(JsonSerializer.SerializeToUtf8Bytes(AgentConfigurationTests.Fixture()));

    private static JsonElement FromNode(int revision, string sha256, int size) => JsonSerializer.SerializeToElement(new
    {
        type = "lockBackground",
        revision,
        background = new { sha256, size, mimeType = "image/webp", width = 1, height = 1 }
    });

    /// <summary>Un nodo falso sin red: responde según la huella pedida y recuerda qué credencial llegó.</summary>
    private sealed class Node(List<string?> credentials) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            credentials.Add(request.Headers.Authorization?.ToString());
            var body = request.RequestUri!.AbsolutePath.EndsWith(LongHash, StringComparison.Ordinal) ? Long : Abc;
            var response = new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(body) };
            response.Content.Headers.ContentType = new("image/webp");
            return Task.FromResult(response);
        }
    }

    [Fact(DisplayName = "REQ-003-73: el servicio de producción usa %ProgramData%\\Pope\\Background; otra raíz usa una subcarpeta propia")]
    public void ChoosesFolderFromAgentRoot()
    {
        var programData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
        Assert.Equal(Path.Combine(programData, "Pope", "Agent"), AgentService.Root);
        Assert.Equal(Path.Combine(programData, "Pope", "Background"), BackgroundSetup.DirectoryFor(AgentService.Root));
        // Los servicios de prueba del SCM no dejan nada en ProgramData\Pope.
        var test = Path.Combine(programData, "PopeAgentTest-" + new string('a', 32));
        Assert.Equal(Path.Combine(test, "Background"), BackgroundSetup.DirectoryFor(test));
        Assert.Equal(Path.Combine(root, "Background"), BackgroundSetup.DirectoryFor(root));
    }

    [Fact(DisplayName = "REQ-003-73/T34: la descarga usa la credencial vigente de cada momento y un fondo nuevo sustituye al anterior")]
    public async Task DownloadsWithTheCurrentConfiguration()
    {
        using var first = Configuration();
        using var second = Configuration();
        Assert.NotEqual(first.Authorization(), second.Authorization());
        var current = first;
        var credentials = new List<string?>();
        var told = new List<JsonElement>();
        var prepared = new List<string>();
        var sync = BackgroundSetup.Create(Folder, prepared.Add, () => current, told.Add, new AgentLog(root), () => new Node(credentials));
        Assert.NotNull(sync);
        Assert.Equal([Folder], prepared);

        sync.OnMessage(FromNode(1, AbcHash, Abc.Length));
        await sync.Pending;
        // El agente se revincula: el siguiente fondo se descarga con la credencial nueva.
        current = second;
        sync.OnMessage(FromNode(2, LongHash, Long.Length));
        await sync.Pending;

        Assert.Equal([first.Authorization(), second.Authorization()], credentials);
        Assert.Equal([1, 2], told.Select(m => m.GetProperty("revision").GetInt32()));
        Assert.Equal([LongHash + ".webp"], Directory.GetFiles(Folder).Select(Path.GetFileName).Cast<string>().ToArray());
    }

    [Fact(DisplayName = "REQ-003-63/73: si la carpeta no es la esperada no hay sincronización del fondo y queda registrado")]
    public void RejectedFolderDisablesTheBackground()
    {
        var log = new AgentLog(root);

        // Una carpeta ordinaria hereda permisos de su padre: BackgroundFolder la rechaza y no se repara.
        var sync = BackgroundSetup.Create(Folder, directory => BackgroundFolder.Prepare(directory), () => Configuration(), _ => { }, log);

        Assert.Null(sync);
        Assert.Contains("BackgroundFolderRejected", File.ReadAllText(Path.Combine(root, "agent.log")));
    }
}
