using System.Diagnostics;
using System.Text.Json;
using Pope.Bridge;

namespace Pope.Agent;

// REQ-003-63: el llamador entrega el proceso que lanzó, nunca un PID declarado por el Shell.
internal sealed class AgentHostBridge(AgentChannel channel, AgentState state, string pcName) : IDisposable
{
    private PipeSession? current;
    private ClientHost? client;
    private bool online;
    private int attached;
    // REQ-003-34: identidad del host asociado (sesión, usuario, logon, PID y creación) mientras viva.
    internal ClientHost? Host => Volatile.Read(ref client);

    internal void Subscribe()
    {
        channel.Message += OnMessage; channel.ConnectionChanged += OnConnection;
    }
    internal async Task RunForHostAsync(Process launchedHost, string pipeName, CancellationToken token)
    {
        if (Interlocked.Exchange(ref attached, 1) != 0) throw new InvalidOperationException("Host ya asociado.");
        try
        {
            using var host = new RetainedProcess(launchedHost);
            if (ClientProcesses.Describe(host.Id) is { } described && host.Alive)
                Volatile.Write(ref client, new ClientHost(host.Session, host.UserSid, host.LogonSid, host.Id, described.Created, described.Image));
            using var pipe = PipeEndpoints.Create(pipeName, host);
            while (host.Alive && !token.IsCancellationRequested)
            {
                await pipe.WaitForConnectionAsync(token);
                if (!PipeEndpoints.IsHost(pipe, host)) { pipe.Disconnect(); await Task.Delay(100, token); continue; }
                using var session = new PipeSession(pipe, "shell-request", "bridge-event", () => PipeEndpoints.IsHost(pipe, host), Dispatch);
                Volatile.Write(ref current, session);
                PublishStatus(); PublishSnapshot();
                try { await session.RunAsync(token); }
                catch (OperationCanceledException) when (token.IsCancellationRequested) { break; }
                catch { /* Rechazo local sin datos ni excepciones en logs. */ }
                finally { Volatile.Write(ref current, null); }
                pipe.Disconnect();
                await Task.Delay(100, token);
            }
        }
        finally { Volatile.Write(ref current, null); Volatile.Write(ref client, null); Volatile.Write(ref attached, 0); }
    }
    private async Task Dispatch(byte[] bytes, CancellationToken token)
    {
        var request = ProtocolValidation.Parse(bytes, "shell-request");
        var nativeAction = request.GetProperty("type").GetString() == "endMaintenance";
        // T40 añadirá el journal de salida: no reenviar una acción nativa como petición al nodo.
        if (!nativeAction && await channel.SendRequestAsync(bytes, token)) return;
        var error = new Dictionary<string, object?>
        {
            ["type"] = "error",
            ["code"] = nativeAction ? "invalid_message" : "internal_error",
            ["message"] = nativeAction ? "Acción nativa no disponible." : "Sin conexión con el servidor."
        };
        if (request.TryGetProperty("requestId", out var id)) error["requestId"] = id.GetString();
        PublishMessage(JsonSerializer.SerializeToElement(error), 0);
    }
    private void OnConnection(bool connected) { online = connected; PublishStatus(); }
    private void OnMessage(JsonElement message)
    {
        var type = message.GetProperty("type").GetString();
        // Conservar existencia de sesión para Alt+Tab aislado antes del snapshot de revocación.
        if (type == "pcAuthenticationError") { PublishMessage(message, 0); PublishSnapshot(); return; }
        if (type is "state" or "sessionEnded" or "pcAuthenticationError") PublishSnapshot();
        if (type == "state") return;
        try { ProtocolValidation.Parse(JsonSerializer.SerializeToUtf8Bytes(message), "shell-notification"); }
        catch (InvalidDataException) { return; } // command/ACK los consume C#, nunca JavaScript.
        PublishMessage(message, 0);
    }
    private void PublishStatus() => Publish(new { version = 1, kind = "status", status = online ? "online" : "offline", pcName });
    private void PublishSnapshot()
    {
        // T27: hasta oír al nodo el host se queda en su bloqueo inicial, sin copia sintética.
        if (!state.Known) return;
        var snapshot = state.Snapshot(); PublishMessage(snapshot.Message, snapshot.ElapsedSeconds);
    }
    private void PublishMessage(JsonElement message, long elapsedSeconds) => Publish(new { version = 1, kind = "message", message, elapsedSeconds });
    private void Publish(object envelope) => Volatile.Read(ref current)?.TrySend(JsonSerializer.SerializeToUtf8Bytes(envelope));
    public void Dispose()
    {
        channel.Message -= OnMessage; channel.ConnectionChanged -= OnConnection;
        Volatile.Read(ref current)?.Close();
    }
}
