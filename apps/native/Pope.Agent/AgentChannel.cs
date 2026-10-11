using System.Net.Security;
using System.Net.WebSockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;

namespace Pope.Agent;

// REQ-003-02/04/63: un propietario de conexión; ningún secreto llega al Shell.
internal sealed class AgentChannel(AgentConfiguration configuration, AgentLog log)
{
    private readonly SemaphoreSlim sendGate = new(1, 1);
    private ClientWebSocket? connected;
    private int running;
    internal event Action<JsonElement>? Message;
    internal event Action<bool>? ConnectionChanged;
    internal Func<object> Hello { get; set; } = () => new
    {
        type = "hello",
        protocolVersion = 2,
        pcId = configuration.PcId,
        recoveryState = "unknown",
        sessionId = (string?)null,
        localRemainingSeconds = (long?)null,
        controlContext = (object?)null,
        pendingMaintenanceExitId = (string?)null
    };
    internal Func<object> Heartbeat { get; set; } = () => new
    {
        type = "heartbeat",
        sessionId = (string?)null,
        localRemainingSeconds = (long?)null,
        controlContext = (object?)null
    };
    internal TimeSpan HeartbeatInterval { get; init; } = TimeSpan.FromSeconds(10);
    internal Func<TimeSpan, CancellationToken, Task> Delay { get; init; } = Task.Delay;
    internal static TimeSpan RetryDelay(int failures) => TimeSpan.FromSeconds(1 << Math.Clamp(failures - 1, 0, 5)) > TimeSpan.FromSeconds(30)
        ? TimeSpan.FromSeconds(30) : TimeSpan.FromSeconds(1 << Math.Clamp(failures - 1, 0, 5));

    internal async Task RunAsync(CancellationToken token)
    {
        if (Interlocked.Exchange(ref running, 1) != 0) throw new InvalidOperationException("Canal ya iniciado.");
        var failures = 0;
        try
        {
            while (!token.IsCancellationRequested)
            {
                using var socket = new ClientWebSocket();
                using var connection = CancellationTokenSource.CreateLinkedTokenSource(token);
                using var handler = new SocketsHttpHandler();
                handler.SslOptions.EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13;
                handler.SslOptions.RemoteCertificateValidationCallback = (_, certificate, _, errors) => Trusted(certificate, errors);
                handler.AllowAutoRedirect = false;
                handler.UseProxy = false;
                using var invoker = new HttpMessageInvoker(handler, disposeHandler: false);
                socket.Options.SetRequestHeader("Authorization", configuration.Authorization());
                // No segundo latido implícito; el protocolo tiene su único temporizador de 10 s.
                socket.Options.KeepAliveInterval = Timeout.InfiniteTimeSpan;
                try
                {
                    using (var handshake = CancellationTokenSource.CreateLinkedTokenSource(token))
                    {
                        handshake.CancelAfter(TimeSpan.FromSeconds(10));
                        var url = new UriBuilder(configuration.NodeUrl) { Scheme = "wss", Path = "/pc" }.Uri;
                        await socket.ConnectAsync(url, invoker, handshake.Token);
                    }
                    await Send(socket, JsonSerializer.SerializeToUtf8Bytes(Hello()), connection.Token);
                    Volatile.Write(ref connected, socket);
                    log.Write(AgentLogCode.TransportConnected);
                    var receiving = Receive(socket, connection.Token, () => failures = 0);
                    var heartbeat = Pulse(socket, connection.Token);
                    try { await await Task.WhenAny(receiving, heartbeat); }
                    finally
                    {
                        connection.Cancel();
                        socket.Abort();
                        try { await Task.WhenAll(receiving, heartbeat); } catch { }
                    }
                }
                catch (OperationCanceledException) when (token.IsCancellationRequested) { break; }
                catch { /* Solo códigos cerrados: ni cabecera, cuerpo, URL ni excepción. */ }
                finally
                {
                    Volatile.Write(ref connected, null);
                    socket.Abort();
                    ConnectionChanged?.Invoke(false);
                }
                log.Write(AgentLogCode.TransportDisconnected);
                failures = Math.Min(failures + 1, 6);
                await Delay(RetryDelay(failures), token);
            }
        }
        finally { Volatile.Write(ref running, 0); }
    }

    private bool Trusted(X509Certificate? certificate, SslPolicyErrors errors)
    {
        if (certificate is null || (errors & (SslPolicyErrors.RemoteCertificateNotAvailable | SslPolicyErrors.RemoteCertificateNameMismatch)) != 0) return false;
        using var received = X509CertificateLoader.LoadCertificate(certificate.GetRawCertData());
        return CryptographicOperations.FixedTimeEquals(received.RawData, configuration.NodeCertificate)
            && received.MatchesHostname(configuration.NodeUrl.DnsSafeHost, allowWildcards: false, allowCommonName: false)
            && DateTime.UtcNow >= received.NotBefore.ToUniversalTime() && DateTime.UtcNow < received.NotAfter.ToUniversalTime();
        // La cadena autofirmada solo se admite para el certificado fijado por medio confiable.
    }

    internal async Task<bool> SendRequestAsync(ReadOnlyMemory<byte> bytes, CancellationToken token)
    {
        ProtocolValidation.Parse(bytes, "shell-request");
        var socket = Volatile.Read(ref connected);
        if (socket is null) return false;
        try { await Send(socket, bytes, token); return true; }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { throw; }
        catch { socket.Abort(); return false; }
    }

    private async Task Send(ClientWebSocket socket, ReadOnlyMemory<byte> bytes, CancellationToken token)
    {
        ProtocolValidation.Parse(bytes, "pc-to-node");
        await sendGate.WaitAsync(token);
        try
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
            deadline.CancelAfter(TimeSpan.FromSeconds(10));
            await socket.SendAsync(bytes, WebSocketMessageType.Text, true, deadline.Token);
        }
        finally { sendGate.Release(); }
    }

    private async Task Pulse(ClientWebSocket socket, CancellationToken token)
    {
        using var timer = new PeriodicTimer(HeartbeatInterval);
        while (await timer.WaitForNextTickAsync(token))
            await Send(socket, JsonSerializer.SerializeToUtf8Bytes(Heartbeat()), token);
    }

    private async Task Receive(ClientWebSocket socket, CancellationToken token, Action authorized)
    {
        var buffer = new byte[ProtocolValidation.MaximumBytes + 1];
        try
        {
            while (true)
            {
                var count = 0;
                ValueWebSocketReceiveResult frame;
                using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
                deadline.CancelAfter(TimeSpan.FromSeconds(30));
                do
                {
                    frame = await socket.ReceiveAsync(buffer.AsMemory(count), deadline.Token);
                    count += frame.Count;
                    if (frame.MessageType != WebSocketMessageType.Text || count > ProtocolValidation.MaximumBytes) throw new InvalidDataException();
                } while (!frame.EndOfMessage);
                var message = ProtocolValidation.Parse(buffer.AsMemory(0, count), "node-to-pc");
                if (message.GetProperty("type").GetString() == "state")
                {
                    authorized();
                    ConnectionChanged?.Invoke(true);
                }
                Message?.Invoke(message);
                if (message.GetProperty("type").GetString() == "pcAuthenticationError") throw new InvalidDataException();
            }
        }
        finally { CryptographicOperations.ZeroMemory(buffer); }
    }
}
