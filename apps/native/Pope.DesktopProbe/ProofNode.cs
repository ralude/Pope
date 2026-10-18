using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using Pope.Agent;
using Pope.Bridge;

namespace Pope.DesktopProbe;

// Solo ensayo: doble del nodo por WSS en loopback con certificado efímero fijado y Bearer.
// No es el nodo de producto: reproduce los mensajes del contrato que el nodo ya envía.
internal sealed class ProofNode : IDisposable
{
    private readonly TcpListener listener = new(IPAddress.Loopback, 0);
    private readonly X509Certificate2 certificate;
    private readonly SemaphoreSlim sending = new(1, 1);
    private readonly string credential = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    internal const string PcId = "01900000-0000-7000-8000-000000000123";

    internal ProofNode()
    {
        using var key = RSA.Create(2048);
        var request = new CertificateRequest("CN=localhost", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        var names = new SubjectAlternativeNameBuilder(); names.AddIpAddress(IPAddress.Loopback);
        request.CertificateExtensions.Add(names.Build());
        using var created = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddHours(1));
        // Schannel exige clave importada; su contenedor temporal se retira al disponer.
        var pfx = created.Export(X509ContentType.Pfx);
        try { certificate = X509CertificateLoader.LoadPkcs12(pfx, null); }
        finally { CryptographicOperations.ZeroMemory(pfx); }
        listener.Start();
    }

    internal AgentConfiguration Configuration() => AgentConfiguration.Parse(JsonSerializer.SerializeToUtf8Bytes(new Dictionary<string, object>
    {
        ["version"] = 1,
        ["pcId"] = PcId,
        ["pcName"] = "PC de ensayo",
        ["nodeUrl"] = $"https://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}",
        ["nodeCertificate"] = Convert.ToBase64String(certificate.RawData),
        ["credential"] = credential
    }));

    internal async Task<WebSocket> Accept(CancellationToken token)
    {
        var client = await listener.AcceptTcpClientAsync(token);
        var stream = new SslStream(client.GetStream());
        await stream.AuthenticateAsServerAsync(new SslServerAuthenticationOptions { ServerCertificate = certificate, EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13 }, token);
        var bytes = new List<byte>(); var single = new byte[1];
        while (bytes.Count < 4096)
        {
            if (await stream.ReadAsync(single, token) == 0) throw new IOException();
            bytes.Add(single[0]);
            if (bytes.Count >= 4 && Encoding.ASCII.GetString(bytes.TakeLast(4).ToArray()) == "\r\n\r\n") break;
        }
        var headers = Encoding.ASCII.GetString(bytes.ToArray());
        if (!headers.StartsWith("GET /pc HTTP/1.1\r\n", StringComparison.Ordinal) || !headers.Contains("Authorization: Bearer " + credential + "\r\n", StringComparison.Ordinal))
            throw new UnauthorizedAccessException("Conexión del agente no válida.");
        var key = headers.Split("\r\n").Single(h => h.StartsWith("Sec-WebSocket-Key:", StringComparison.OrdinalIgnoreCase)).Split(':', 2)[1].Trim();
        var accept = Convert.ToBase64String(SHA1.HashData(Encoding.ASCII.GetBytes(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")));
        await stream.WriteAsync(Encoding.ASCII.GetBytes($"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {accept}\r\n\r\n"), token);
        return WebSocket.CreateFromStream(stream, new WebSocketCreationOptions { IsServer = true, KeepAliveInterval = Timeout.InfiniteTimeSpan });
    }

    internal static async Task<JsonElement> Read(WebSocket socket, CancellationToken token)
    {
        var buffer = new byte[ProtocolValidation.MaximumBytes];
        var frame = await socket.ReceiveAsync(buffer.AsMemory(), token);
        if (!frame.EndOfMessage || frame.MessageType != WebSocketMessageType.Text) throw new InvalidDataException();
        return ProtocolValidation.Parse(buffer.AsMemory(0, frame.Count), "pc-to-node");
    }

    internal async Task Send(WebSocket socket, object message, CancellationToken token)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(message);
        ProtocolValidation.Parse(bytes, "node-to-pc");
        await sending.WaitAsync(token);
        try { await socket.SendAsync(bytes.AsMemory(), WebSocketMessageType.Text, true, token); }
        finally { sending.Release(); }
    }

    public void Dispose() { listener.Stop(); certificate.Dispose(); sending.Dispose(); }
}
