using System.Net;
using System.Net.Security;
using System.Security.Authentication;
using System.Text;
using System.Text.Json;
using Pope.Agent;
using Xunit;

namespace Pope.Native.Tests;

public sealed class BackgroundDownloaderTests : IDisposable
{
    // Vector estándar de SHA-256 (FIPS 180-2): el resumen de los tres bytes «abc».
    private const string AbcHash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    private static readonly byte[] Abc = "abc"u8.ToArray();

    private readonly string directory = Path.Combine(Path.GetTempPath(), "pope-download-" + Guid.NewGuid().ToString("N"));
    private readonly BackgroundStore store;

    public BackgroundDownloaderTests()
    {
        Directory.CreateDirectory(directory);
        store = new BackgroundStore(directory);
    }

    public void Dispose() => Directory.Delete(directory, recursive: true);

    private static AgentConfiguration Configuration() => AgentConfiguration.Parse(JsonSerializer.SerializeToUtf8Bytes(AgentConfigurationTests.Fixture()));
    private string[] Files() => Directory.GetFileSystemEntries(directory).Select(Path.GetFileName).Cast<string>().Order().ToArray();

    private static HttpResponseMessage Image(byte[] body, string type = "image/webp", long? length = null)
    {
        var response = new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(body) };
        response.Content.Headers.ContentType = new(type);
        response.Content.Headers.ContentLength = length ?? body.Length;
        return response;
    }

    /// <summary>Un nodo falso sin red: guarda cómo era la petición antes de que se libere.</summary>
    private sealed class FakeNode(Func<HttpResponseMessage> respond) : HttpMessageHandler
    {
        internal List<(HttpMethod Method, Uri? Uri, string? Authorization, string? Accept)> Requests { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            Requests.Add((request.Method, request.RequestUri, request.Headers.Authorization?.ToString(), request.Headers.Accept.ToString()));
            return Task.FromResult(respond());
        }
    }

    [Fact(DisplayName = "REQ-003-73: la descarga pide la huella con la credencial de la PC y guarda la imagen verificada")]
    public async Task DownloadsWithPcCredential()
    {
        using var configuration = Configuration();
        var node = new FakeNode(() => Image(Abc));

        await new BackgroundDownloader(configuration, store, node).DownloadAsync(AbcHash, 3, CancellationToken.None);

        var request = Assert.Single(node.Requests);
        Assert.Equal(HttpMethod.Get, request.Method);
        // Sin parámetros en la URL: la credencial solo va en la cabecera (ADR-0017).
        Assert.Equal($"https://localhost:3000/lock-background/image/{AbcHash}", request.Uri?.AbsoluteUri);
        Assert.Equal(configuration.Authorization(), request.Authorization);
        Assert.Equal("image/webp", request.Accept);
        Assert.Equal([AbcHash + ".webp"], Files());
        Assert.Equal(Abc, await File.ReadAllBytesAsync(Path.Combine(directory, AbcHash + ".webp")));
    }

    [Fact(DisplayName = "REQ-003-73: una respuesta que no es el fondo anunciado no deja archivos")]
    public async Task RejectsBadResponsesWithoutFiles()
    {
        using var configuration = Configuration();
        // Estados de error del nodo: credencial rechazada, huella ya sustituida o nodo caído.
        foreach (var status in new[] { HttpStatusCode.Unauthorized, HttpStatusCode.NotFound, HttpStatusCode.InternalServerError })
        {
            var node = new FakeNode(() => new HttpResponseMessage(status));
            await Assert.ThrowsAsync<HttpRequestException>(() => new BackgroundDownloader(configuration, store, node).DownloadAsync(AbcHash, 3, CancellationToken.None));
        }

        var rejections = new (string Case, Func<HttpResponseMessage> Response)[]
        {
            ("tipo que no es WebP", () => Image(Abc, "text/html")),
            ("anuncia más bytes de los esperados", () => Image(Abc, length: 2_000_001)),
            ("contenido distinto del anunciado", () => Image("abd"u8.ToArray())),
            ("más bytes de los esperados", () => Image("abcd"u8.ToArray())),
        };
        foreach (var (_, response) in rejections)
            await Assert.ThrowsAsync<InvalidDataException>(() => new BackgroundDownloader(configuration, store, new FakeNode(response)).DownloadAsync(AbcHash, 3, CancellationToken.None));
        Assert.Empty(Files());
    }

    [Fact(DisplayName = "REQ-003-63/73: una huella que no es una huella no llega a la URL")]
    public async Task InvalidHashNeverBuildsAnUrl()
    {
        using var configuration = Configuration();
        var node = new FakeNode(() => Image(Abc));

        foreach (var hash in new[] { "../" + AbcHash, AbcHash + "?x=1", AbcHash.ToUpperInvariant(), "" })
            await Assert.ThrowsAsync<InvalidDataException>(() => new BackgroundDownloader(configuration, store, node).DownloadAsync(hash, 3, CancellationToken.None));

        Assert.Empty(node.Requests);
        Assert.Empty(Files());
    }

    /// <summary>Atiende una petición HTTP/1.1 por TLS: devuelve sus cabeceras y responde con lo dado.</summary>
    private static async Task<string> ServeOnce(AgentChannelTests.Peer peer, byte[] response, CancellationToken token)
    {
        using var client = await peer.Listener.AcceptTcpClientAsync(token);
        using var stream = new SslStream(client.GetStream());
        await stream.AuthenticateAsServerAsync(peer.Options(), token);
        var bytes = new List<byte>(); var single = new byte[1];
        while (bytes.Count < 4096)
        {
            if (await stream.ReadAsync(single, token) == 0) throw new IOException();
            bytes.Add(single[0]);
            if (bytes.Count >= 4 && Encoding.ASCII.GetString(bytes.TakeLast(4).ToArray()) == "\r\n\r\n") break;
        }
        await stream.WriteAsync(response, token);
        await stream.FlushAsync(token);
        return Encoding.ASCII.GetString(bytes.ToArray());
    }

    [Fact(DisplayName = "REQ-003-63/73: por TLS real con el certificado fijado, el nodo recibe la credencial y se instala la imagen")]
    public async Task DownloadsOverPinnedTls()
    {
        using var peer = new AgentChannelTests.Peer();
        using var configuration = peer.Configuration();
        using var cancel = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var serving = ServeOnce(peer, Encoding.ASCII.GetBytes("HTTP/1.1 200 OK\r\nContent-Type: image/webp\r\nContent-Length: 3\r\nConnection: close\r\n\r\nabc"), cancel.Token);

        await new BackgroundDownloader(configuration, store).DownloadAsync(AbcHash, 3, cancel.Token);

        var headers = await serving;
        Assert.StartsWith($"GET /lock-background/image/{AbcHash} HTTP/1.1\r\n", headers);
        Assert.Contains("Authorization: " + configuration.Authorization() + "\r\n", headers);
        Assert.Equal([AbcHash + ".webp"], Files());
    }

    [Fact(DisplayName = "REQ-003-63: un certificado ajeno nunca recibe la cabecera de autenticación")]
    public async Task ForeignCertificateNeverReceivesCredential()
    {
        using var peer = new AgentChannelTests.Peer();
        using var trusted = new AgentChannelTests.Peer();
        using var configuration = peer.Configuration(trusted.Certificate);
        using var cancel = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var received = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
        var listening = Task.Run(async () =>
        {
            using var client = await peer.Listener.AcceptTcpClientAsync(cancel.Token);
            using var stream = new SslStream(client.GetStream());
            try { await stream.AuthenticateAsServerAsync(peer.Options(), cancel.Token); } catch (AuthenticationException) { }
            // Si el cliente hubiera aceptado el certificado, aquí estarían la petición y su credencial.
            try { received.TrySetResult(await stream.ReadAsync(new byte[1], cancel.Token)); } catch (Exception) { received.TrySetResult(0); }
        }, cancel.Token);

        await Assert.ThrowsAnyAsync<HttpRequestException>(() => new BackgroundDownloader(configuration, store).DownloadAsync(AbcHash, 3, cancel.Token));

        Assert.Equal(0, await received.Task.WaitAsync(cancel.Token));
        await listening;
        Assert.Empty(Files());
    }
}
