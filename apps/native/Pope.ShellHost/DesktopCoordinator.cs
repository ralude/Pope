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
    private readonly System.Windows.Forms.Timer timer = new() { Interval = 100 };
    private PipeSession? current;
    private JsonElement status = HostBridge.Offline();
    private readonly DesktopTransition transition;
    private readonly object gate = new();
    private bool childReady;
    internal bool Blocked => transition.Blocked;
    internal string LockName => locked.Name;

    internal DesktopCoordinator(HostBridge bridge, string? proofProfile = null)
    {
        this.bridge = bridge;
        transition = new DesktopTransition(blocked => { if (blocked) locked.Activate(); else use.Activate(); });
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
        catch { locked.Dispose(); use.Dispose(); closing.Dispose(); throw; }
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
            // Una desconexión LAN conserva autorización monotónica; perder el agente no.
            if (!childReady) return;
            var desired = authorization.Blocked || child.HasExited || !bridge.ServerAlive;
            transition.Apply(desired);
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
                            if (!childReady) { transition.Apply(true); childReady = true; Reconcile(); }
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
        timer.Stop(); timer.Dispose(); hook.Dispose(); closing.Cancel();
        // Retirar solo el hijo creado: nunca cerrar apps de cliente durante bloqueo/pausa.
        if (!child.HasExited) { child.Kill(true); child.WaitForExit(5000); }
        try { pipeTask.WaitAsync(TimeSpan.FromSeconds(5)).GetAwaiter().GetResult(); } catch (OperationCanceledException) { }
        child.Dispose(); locked.Dispose(); use.Dispose(); closing.Dispose();
    }
}
