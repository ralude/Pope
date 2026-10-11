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
using Xunit;
using Xunit.Abstractions;

namespace Pope.Native.Tests;

public sealed class AgentChannelTests(ITestOutputHelper output)
{
    [Fact(DisplayName = "REQ-003-63: frames binarios, duplicados y grandes se cierran; revocación no reintenta")]
    public async Task FramesAndRevocation()
    {
        using var peer = new Peer();
        using var configuration = peer.Configuration();
        var root = Temporary();
        using var cancel = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var revoked = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var offline = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var channel = new AgentChannel(configuration, new AgentLog(root)) { Delay = (_, t) => Task.Delay(10, t) };
        channel.Message += m => { if (m.GetProperty("type").GetString() == "pcAuthenticationError") revoked.TrySetResult(); };
        channel.ConnectionChanged += online => { if (!online && revoked.Task.IsCompleted) offline.TrySetResult(); };
        var run = channel.RunAsync(cancel.Token);
        try
        {
            foreach (var (bytes, type) in new[] {
                ("{}"u8.ToArray(), WebSocketMessageType.Binary),
                ("{\"type\":\"state\",\"status\":\"locked\",\"status\":\"locked\"}"u8.ToArray(), WebSocketMessageType.Text),
                (new byte[16_385], WebSocketMessageType.Text) })
            {
                using var socket = await peer.Accept(configuration.Authorization(), cancel.Token);
                await Read(socket, cancel.Token);
                await socket.SendAsync(bytes, type, true, cancel.Token);
                var buffer = new byte[100];
                try { var frame = await socket.ReceiveAsync(buffer.AsMemory(), cancel.Token); Assert.Equal(WebSocketMessageType.Close, frame.MessageType); }
                catch (WebSocketException) { }
            }
            using var last = await peer.Accept(configuration.Authorization(), cancel.Token);
            await Read(last, cancel.Token);
            await last.SendAsync("{\"type\":\"pcAuthenticationError\",\"code\":\"pc_credential_revoked\",\"message\":\"Credencial revocada\"}"u8.ToArray(), WebSocketMessageType.Text, true, cancel.Token);
            await offline.Task.WaitAsync(cancel.Token);
            using var noRetry = new CancellationTokenSource(TimeSpan.FromMilliseconds(200));
            await Assert.ThrowsAnyAsync<OperationCanceledException>(async () => { using var unexpected = await peer.Listener.AcceptTcpClientAsync(noRetry.Token); });
            Assert.False(run.IsCompleted);
        }
        finally { cancel.Cancel(); try { await run; } catch (OperationCanceledException) { } Directory.Delete(root, true); }
    }

    [Fact(DisplayName = "REQ-003-02/63: 150 reconexiones reales conservan memoria y handles acotados")]
    public async Task ReconnectMemoryIsStable()
    {
        using var peer = new Peer();
        using var configuration = peer.Configuration();
        var root = Temporary();
        using var cancel = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        var channel = new AgentChannel(configuration, new AgentLog(root)) { Delay = (_, t) => Task.Delay(1, t) };
        var run = channel.RunAsync(cancel.Token);
        long baseline = 0;
        var handles = 0;
        try
        {
            for (var index = 0; index < 150; index++)
            {
                using (var socket = await peer.Accept(configuration.Authorization(), cancel.Token))
                {
                    await Read(socket, cancel.Token);
                    await socket.SendAsync("{}"u8.ToArray(), WebSocketMessageType.Text, true, cancel.Token);
                    var buffer = new byte[100];
                    try { await socket.ReceiveAsync(buffer.AsMemory(), cancel.Token); } catch (WebSocketException) { }
                }
                if (index == 49) { baseline = GC.GetTotalMemory(true); handles = System.Diagnostics.Process.GetCurrentProcess().HandleCount; }
            }
            cancel.Cancel();
            try { await run; } catch (OperationCanceledException) { }
            var growth = GC.GetTotalMemory(true) - baseline;
            var handleGrowth = System.Diagnostics.Process.GetCurrentProcess().HandleCount - handles;
            output.WriteLine($"REQ-003-63: 150 WSS, memoria retenida adicional={growth} bytes, handles adicionales={handleGrowth}.");
            Assert.InRange(growth, long.MinValue, 10 * 1024 * 1024);
            Assert.InRange(handleGrowth, int.MinValue, 20);
            Assert.All(Directory.GetFiles(root), p => Assert.InRange(new FileInfo(p).Length, 1, AgentLog.MaximumBytes));
        }
        finally { cancel.Cancel(); try { await run; } catch (OperationCanceledException) { } Directory.Delete(root, true); }
    }
    [Fact(DisplayName = "REQ-003-02/04/63: WSS real verifica Bearer, hello, latidos y reconexión única")]
    public async Task AuthenticatedReconnect()
    {
        using var peer = new Peer();
        using var configuration = peer.Configuration();
        var root = Temporary();
        using var cancel = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        var channel = new AgentChannel(configuration, new AgentLog(root)) { HeartbeatInterval = TimeSpan.FromMilliseconds(100), Delay = (_, t) => Task.Delay(20, t) };
        var run = channel.RunAsync(cancel.Token);
        try
        {
            await Assert.ThrowsAsync<InvalidOperationException>(() => channel.RunAsync(cancel.Token));
            for (var connection = 0; connection < 2; connection++)
            {
                using var socket = await peer.Accept(configuration.Authorization(), cancel.Token);
                var hello = await Read(socket, cancel.Token);
                Assert.Equal("unknown", hello.GetProperty("recoveryState").GetString());
                Assert.Equal(configuration.PcId, hello.GetProperty("pcId").GetString());
                await socket.SendAsync("{\"type\":\"state\",\"status\":\"locked\"}"u8.ToArray(), WebSocketMessageType.Text, true, cancel.Token);
                var heartbeat = await Read(socket, cancel.Token);
                Assert.Equal("heartbeat", heartbeat.GetProperty("type").GetString());
                Assert.Equal(JsonValueKind.Null, heartbeat.GetProperty("controlContext").ValueKind);
                socket.Abort();
            }
        }
        finally
        {
            cancel.Cancel();
            try { await run; } catch (OperationCanceledException) { }
            if (File.Exists(Path.Combine(root, "agent.log"))) Assert.DoesNotContain(configuration.Authorization(), File.ReadAllText(Path.Combine(root, "agent.log")));
            Directory.Delete(root, true);
        }
    }

    [Fact(DisplayName = "REQ-003-63: certificado ajeno nunca recibe cabecera de autenticación")]
    public async Task FalseCertificateRejected()
    {
        using var peer = new Peer();
        using var trusted = new Peer();
        using var configuration = peer.Configuration(trusted.Certificate);
        var root = Temporary();
        using var cancel = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var retry = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var channel = new AgentChannel(configuration, new AgentLog(root))
        {
            Delay = async (_, token) => { retry.TrySetResult(); await Task.Delay(Timeout.InfiniteTimeSpan, token); }
        };
        var run = channel.RunAsync(cancel.Token);
        try
        {
            using var client = await peer.Listener.AcceptTcpClientAsync(cancel.Token);
            using var stream = new SslStream(client.GetStream());
            try { await stream.AuthenticateAsServerAsync(peer.Options(), cancel.Token); } catch (AuthenticationException) { }
            await retry.Task.WaitAsync(cancel.Token);
            // El canal rechazó TLS antes de poder enviar el upgrade HTTP/Bearer.
            Assert.False(await channel.SendRequestAsync("{\"type\":\"listCombos\"}"u8.ToArray(), cancel.Token));
        }
        finally { cancel.Cancel(); try { await run; } catch (OperationCanceledException) { } Directory.Delete(root, true); }
    }

    [Fact(DisplayName = "REQ-003-02/63: backoff limitado, cancelación y ningún mensaje UI fabrica hello")]
    public async Task BoundedRetries()
    {
        using var peer = new Peer();
        using var configuration = peer.Configuration();
        peer.Listener.Stop();
        var root = Temporary();
        using var cancel = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        var delays = new List<TimeSpan>();
        var channel = new AgentChannel(configuration, new AgentLog(root))
        {
            Delay = (delay, _) => { delays.Add(delay); if (delays.Count == 7) cancel.Cancel(); return Task.CompletedTask; }
        };
        try
        {
            await channel.RunAsync(cancel.Token);
            Assert.Equal(7, delays.Count);
            Assert.Equal(new[] { 1, 2, 4, 8, 16, 30 }, delays.Take(6).Select(t => (int)t.TotalSeconds));
            Assert.All(delays.Skip(6), t => Assert.Equal(30, t.TotalSeconds));
            for (var failure = 7; failure < 10_000; failure++) Assert.Equal(TimeSpan.FromSeconds(30), AgentChannel.RetryDelay(failure));
            await Assert.ThrowsAsync<InvalidDataException>(() => channel.SendRequestAsync("{\"type\":\"hello\"}"u8.ToArray(), CancellationToken.None));
            Assert.All(Directory.GetFiles(root), p => Assert.InRange(new FileInfo(p).Length, 1, AgentLog.MaximumBytes));
        }
        finally { Directory.Delete(root, true); }
    }

    private static string Temporary()
    {
        var root = Path.Combine(Path.GetTempPath(), "pope-channel-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root); return root;
    }
    private static async Task<JsonElement> Read(WebSocket socket, CancellationToken token)
    {
        var buffer = new byte[16_384];
        var frame = await socket.ReceiveAsync(buffer.AsMemory(), token);
        Assert.True(frame.EndOfMessage);
        return ProtocolValidation.Parse(buffer.AsMemory(0, frame.Count), "pc-to-node");
    }

    private sealed class Peer : IDisposable
    {
        internal TcpListener Listener { get; } = new(IPAddress.Loopback, 0);
        internal X509Certificate2 Certificate { get; }
        private readonly int port;
        internal Peer()
        {
            using var key = RSA.Create(2048);
            var request = new CertificateRequest("CN=localhost", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            var names = new SubjectAlternativeNameBuilder(); names.AddDnsName("localhost"); names.AddIpAddress(IPAddress.Loopback);
            request.CertificateExtensions.Add(names.Build());
            using var created = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddDays(1));
            // Schannel exige clave importada; su contenedor temporal se retira al disponer.
            var pfx = created.Export(X509ContentType.Pfx);
            try { Certificate = X509CertificateLoader.LoadPkcs12(pfx, null); }
            finally { CryptographicOperations.ZeroMemory(pfx); }
            Listener.Start(); port = ((IPEndPoint)Listener.LocalEndpoint).Port;
        }
        internal AgentConfiguration Configuration(X509Certificate2? pin = null)
        {
            var fixture = AgentConfigurationTests.Fixture();
            fixture["nodeUrl"] = $"https://127.0.0.1:{port}";
            fixture["nodeCertificate"] = Convert.ToBase64String((pin ?? Certificate).RawData);
            return AgentConfiguration.Parse(JsonSerializer.SerializeToUtf8Bytes(fixture));
        }
        internal SslServerAuthenticationOptions Options() => new() { ServerCertificate = Certificate, EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13 };
        internal async Task<WebSocket> Accept(string authorization, CancellationToken token)
        {
            var client = await Listener.AcceptTcpClientAsync(token);
            var stream = new SslStream(client.GetStream());
            await stream.AuthenticateAsServerAsync(Options(), token);
            var bytes = new List<byte>(); var single = new byte[1];
            while (bytes.Count < 4096)
            {
                if (await stream.ReadAsync(single, token) == 0) throw new IOException();
                bytes.Add(single[0]);
                if (bytes.Count >= 4 && Encoding.ASCII.GetString(bytes.TakeLast(4).ToArray()) == "\r\n\r\n") break;
            }
            var headers = Encoding.ASCII.GetString(bytes.ToArray());
            Assert.StartsWith("GET /pc HTTP/1.1\r\n", headers);
            Assert.Contains("Authorization: " + authorization + "\r\n", headers);
            var key = headers.Split("\r\n").Single(h => h.StartsWith("Sec-WebSocket-Key:", StringComparison.OrdinalIgnoreCase)).Split(':', 2)[1].Trim();
            var accept = Convert.ToBase64String(SHA1.HashData(Encoding.ASCII.GetBytes(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")));
            await stream.WriteAsync(Encoding.ASCII.GetBytes($"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {accept}\r\n\r\n"), token);
            return WebSocket.CreateFromStream(stream, new WebSocketCreationOptions { IsServer = true, KeepAliveInterval = Timeout.InfiniteTimeSpan });
        }
        public void Dispose() { Listener.Stop(); Certificate.Dispose(); }
    }
}
