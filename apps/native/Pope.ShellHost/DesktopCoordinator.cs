using System.Diagnostics;
using System.Text.Json;
using Pope.Bridge;

namespace Pope.ShellHost;

// T21: una instancia por escritorio; la UI de bloqueo nunca se mueve al de uso.
internal sealed class DesktopCoordinator : IDisposable
{
    private readonly NativeDesktop use = NativeDesktop.Current();
    private readonly NativeDesktop locked = NativeDesktop.Create("PopeLock" + Guid.NewGuid().ToString("N"));
    private readonly DesktopAuthorization authorization = new();
    private readonly CancellationTokenSource closing = new();
    private readonly HostBridge bridge;
    private readonly Process child;
    private readonly Task pipeTask;
    private readonly KeyboardGuard hook;
    private readonly PauseAudioWorker audio;
    private readonly System.Windows.Forms.Timer timer = new() { Interval = 100 };
    private PipeSession? current;
    private JsonElement status = HostBridge.Offline();
    private readonly DesktopTransition transition;
    private readonly object gate = new();
    private bool childReady, agentLost;
    internal bool Blocked => transition.Blocked;
    internal string LockName => locked.Name;

    internal DesktopCoordinator(HostBridge bridge, string? proofProfile = null, string? audioJournal = null)
    {
        this.bridge = bridge;
        transition = new DesktopTransition(blocked => { if (blocked) locked.Activate(); else use.Activate(); });
        audioJournal ??= Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Pope", "PauseAudio.json");
        audio = new PauseAudioWorker(new PauseAudio(new CoreAudioEndpoints(), audioJournal));
        try
        {
            var name = PipeEndpoints.NewName();
            var arguments = new List<string> { "--lock-pipe", name, "--host-pid", Environment.ProcessId.ToString() };
            if (proofProfile != null) { arguments.Add("--proof-profile"); arguments.Add(proofProfile); }
            child = locked.Start(Environment.ProcessPath!, arguments.ToArray());
            pipeTask = Relay(name);
            hook = new KeyboardGuard(() => (transition.Blocked, authorization.HasSession), install: true);
            timer.Tick += (_, _) => Reconcile(); timer.Start();
        }
        catch { audio.Dispose(); locked.Dispose(); use.Dispose(); closing.Dispose(); throw; }
    }
    internal Task Apply(JsonElement envelope, CancellationToken token)
    {
        lock (gate)
        {
            authorization.Apply(envelope);
            if (envelope.GetProperty("kind").GetString() == "status") status = envelope.Clone();
            Volatile.Read(ref current)?.TrySend(JsonSerializer.SerializeToUtf8Bytes(envelope));
            Reconcile(); return Task.CompletedTask;
        }
    }
    private void Reconcile()
    {
        lock (gate)
        {
            if (!bridge.ServerAlive && !agentLost)
            {
                // T27 / REQ-003-32: sin agente no hay autoridad. Se olvida la sesión (Alt+Tab
                // vuelve a inhibirse) y el bloqueo muestra la pantalla sin sesión, no botones
                // que ya no pueden llegar al nodo. Este host no se reconecta a otro agente.
                agentLost = true;
                var locked = JsonSerializer.SerializeToElement(new { version = 1, kind = "message", message = new { type = "state", status = "locked" }, elapsedSeconds = 0 });
                authorization.Apply(locked);
                Volatile.Read(ref current)?.TrySend(JsonSerializer.SerializeToUtf8Bytes(locked));
            }
            // REQ-002-07: el silencio sigue a la pausa del nodo, también sin red ni hijo listo.
            // Sin agente se congela: el host que lo sustituya decide con el estado nuevo del nodo.
            if (authorization.Known && !agentLost) audio.Update(authorization.Paused);
            // Una desconexión LAN conserva autorización monotónica; perder el agente no.
            if (!childReady) return;
            var desired = authorization.Blocked || child.HasExited || !bridge.ServerAlive;
            // Un cambio rechazado no confirma nada: el temporizador de 100 ms lo reintenta.
            transition.TryApply(desired);
        }
    }
    private async Task Relay(string name)
    {
        using var retained = new RetainedProcess(child);
        using var pipe = PipeEndpoints.Create(name, retained);
        try
        {
            while (!closing.IsCancellationRequested && retained.Alive)
            {
                await pipe.WaitForConnectionAsync(closing.Token);
                if (!PipeEndpoints.IsHost(pipe, retained)) { pipe.Disconnect(); continue; }
                using var session = new PipeSession(pipe, "bridge-request", "bridge-event", () => PipeEndpoints.IsHost(pipe, retained), (bytes, _) =>
                {
                    var envelope = ProtocolValidation.Parse(bytes, "bridge-request");
                    if (envelope.GetProperty("kind").GetString() == "ready")
                    {
                        lock (gate)
                        {
                            if (!childReady) { childReady = true; Reconcile(); }
                        }
                        return Task.CompletedTask;
                    }
                    var request = envelope.GetProperty("request");
                    if (!bridge.Send(request))
                    {
                        var error = new Dictionary<string, object?> { ["type"] = "error", ["code"] = "internal_error", ["message"] = "Sin conexión con el servidor." };
                        if (request.TryGetProperty("requestId", out var id)) error["requestId"] = id.GetString();
                        Volatile.Read(ref current)?.TrySend(JsonSerializer.SerializeToUtf8Bytes(new { version = 1, kind = "message", message = error, elapsedSeconds = 0 }));
                    }
                    return Task.CompletedTask;
                });
                Volatile.Write(ref current, session);
                lock (gate)
                { session.TrySend(JsonSerializer.SerializeToUtf8Bytes(status)); session.TrySend(JsonSerializer.SerializeToUtf8Bytes(authorization.Snapshot())); }
                try { await session.RunAsync(closing.Token); }
                catch (OperationCanceledException) when (closing.IsCancellationRequested) { break; }
                catch { /* Rechazar sesiones inválidas sin registrar cuerpos. */ }
                finally { Volatile.Write(ref current, null); }
                pipe.Disconnect();
            }
        }
        catch (OperationCanceledException) when (closing.IsCancellationRequested) { }
    }
    public void Dispose()
    {
        timer.Stop(); timer.Dispose(); hook.Dispose(); audio.Dispose(); closing.Cancel();
        // Retirar solo el hijo creado: nunca cerrar apps de cliente durante bloqueo/pausa.
        if (!child.HasExited) { child.Kill(true); child.WaitForExit(5000); }
        try { pipeTask.WaitAsync(TimeSpan.FromSeconds(5)).GetAwaiter().GetResult(); } catch (OperationCanceledException) { }
        child.Dispose(); locked.Dispose(); use.Dispose(); closing.Dispose();
    }
}
