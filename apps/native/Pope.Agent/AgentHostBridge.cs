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
    // Último fondo verificado en esta PC; solo metadatos (la imagen está en la carpeta de fondos).
    private readonly object backgroundGate = new();
    private JsonElement? lastBackground;
    private readonly Dictionary<string, TaskCompletionSource> pendingMessages = [];
    // T40: «Terminar y bloquear» pulsado en la PC. Lo cablea el runtime; sin él no hay acción nativa.
    internal Func<string, CancellationToken, Task<bool>>? EndMaintenance { get; set; }
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
                PublishStatus(); PublishSnapshot(); PublishLastBackground();
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
    // T32 · REQ-003-20: pasa el mensaje al host y espera su confirmación de que lo mostró.
    // Sin host conectado devuelve null (no hay pantalla); si no confirma a tiempo, false.
    internal async Task<bool?> ShowStaffMessageAsync(string commandId, string text, TimeSpan timeout, CancellationToken token)
    {
        var shown = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        lock (pendingMessages) pendingMessages[commandId] = shown;
        try
        {
            var bytes = JsonSerializer.SerializeToUtf8Bytes(new { version = 1, kind = "staffMessage", commandId, text });
            if (Volatile.Read(ref current)?.TrySend(bytes) != true) return null;
            try { await shown.Task.WaitAsync(timeout, token); return true; }
            catch (TimeoutException) { return false; }
        }
        finally { lock (pendingMessages) pendingMessages.Remove(commandId); }
    }

    private async Task Dispatch(byte[] bytes, CancellationToken token)
    {
        var request = ProtocolValidation.Parse(bytes, "shell-request");
        if (request.GetProperty("type").GetString() == "staffMessageShown")
        {
            // Confirmación del propio host (React no puede enviarla); nunca se reenvía al nodo.
            lock (pendingMessages)
                if (pendingMessages.TryGetValue(request.GetProperty("commandId").GetString()!, out var shown)) shown.TrySetResult();
            return;
        }
        var nativeAction = request.GetProperty("type").GetString() == "endMaintenance";
        if (nativeAction && EndMaintenance != null)
        {
            // La salida se guarda en el diario y se bloquea sin esperar a la red; no es una petición al nodo.
            var requestId = request.GetProperty("requestId").GetString();
            var done = await EndMaintenance(request.GetProperty("maintenanceId").GetString()!, token);
            PublishMessage(JsonSerializer.SerializeToElement(done
                ? new Dictionary<string, object?> { ["type"] = "maintenanceState", ["maintenance"] = null, ["requestId"] = requestId }
                : new Dictionary<string, object?> { ["type"] = "error", ["code"] = "internal_error", ["message"] = "No se pudo terminar el mantenimiento.", ["requestId"] = requestId }), 0);
            return;
        }
        // Sin runtime que la atienda, una acción nativa no se reenvía como petición al nodo.
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
    // REQ-003-73: el agente avisa al host de que el fondo ya está en esta PC (imagen verificada).
    internal void PublishBackground(JsonElement message)
    {
        ProtocolValidation.Parse(JsonSerializer.SerializeToUtf8Bytes(message), "shell-notification");
        // Se recuerda el último: un host que se conecte después (o tras reiniciarse) lo recibe al entrar.
        lock (backgroundGate) lastBackground = message.Clone();
        PublishMessage(message, 0);
    }
    private void PublishLastBackground()
    {
        JsonElement? saved;
        lock (backgroundGate) saved = lastBackground;
        if (saved is { } message) PublishMessage(message, 0);
    }
    internal void OnMessage(JsonElement message)
    {
        var type = message.GetProperty("type").GetString();
        // REQ-003-73: el fondo del nodo solo trae metadatos; lo consume BackgroundSync, que avisa al host
        // cuando la imagen ya está verificada aquí. El aviso crudo nunca llega al host ni al Shell.
        if (type == "lockBackground") return;
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
