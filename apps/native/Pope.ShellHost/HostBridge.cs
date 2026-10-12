using System.Text.Json;
using Pope.Bridge;

namespace Pope.ShellHost;

// REQ-003-04/63: un pipe cancelable, reintentos acotados y ninguna petición almacenada para reenvío.
internal sealed class HostBridge(string name, RetainedProcess server, bool desktopPeer = false) : IDisposable
{
    private readonly CancellationTokenSource stopping = new();
    private PipeSession? current;
    private int started;
    internal bool ServerAlive => server.Alive;

    internal bool Send(JsonElement request) => Volatile.Read(ref current)?.TrySend(JsonSerializer.SerializeToUtf8Bytes(desktopPeer
        ? JsonSerializer.SerializeToElement(new { version = 1, kind = "request", request }) : request)) == true;
    internal bool SendReady() => desktopPeer && Volatile.Read(ref current)?.TrySend(JsonSerializer.SerializeToUtf8Bytes(new { version = 1, kind = "ready" })) == true;
    internal void Stop() => stopping.Cancel();

    internal async Task RunAsync(Func<JsonElement, CancellationToken, Task> deliver, CancellationToken token)
    {
        if (Interlocked.Exchange(ref started, 1) != 0) throw new InvalidOperationException("Puente ya iniciado.");
        using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(token, stopping.Token);
        var attempt = 0;
        var pcName = "PC";
        try
        {
            while (server.Alive)
            {
                lifetime.Token.ThrowIfCancellationRequested();
                try
                {
                    using var pipe = await PipeEndpoints.Connect(name, server, lifetime.Token);
                    using var session = new PipeSession(pipe, "bridge-event", desktopPeer ? "bridge-request" : "shell-request", () => PipeEndpoints.IsServer(pipe, server), async (bytes, cancel) =>
                    {
                        var message = ProtocolValidation.Parse(bytes, "bridge-event");
                        attempt = 0;
                        if (message.GetProperty("kind").GetString() == "status") pcName = message.GetProperty("pcName").GetString()!;
                        await deliver(message, cancel);
                    });
                    Volatile.Write(ref current, session);
                    try { await session.RunAsync(lifetime.Token); }
                    finally { Volatile.Write(ref current, null); }
                }
                catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { break; }
                catch { /* Solo estado cerrado; nunca cuerpos, rutas de custodia ni excepciones. */ }
                await deliver(Offline(pcName), lifetime.Token);
                await Task.Delay(TimeSpan.FromSeconds(Math.Min(30, 1 << attempt)), lifetime.Token);
                attempt = Math.Min(5, attempt + 1);
            }
        }
        finally { Volatile.Write(ref current, null); }
    }

    internal static JsonElement Offline(string pcName = "PC") => JsonSerializer.SerializeToElement(new { version = 1, kind = "status", status = "offline", pcName });
    public void Dispose() { Stop(); Volatile.Read(ref current)?.Close(); stopping.Dispose(); }
}
