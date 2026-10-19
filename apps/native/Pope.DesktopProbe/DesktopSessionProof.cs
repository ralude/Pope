using System.Diagnostics;
using System.Text.Json;
using Pope.Bridge;
using Pope.ShellHost;

namespace Pope.DesktopProbe;

// T21: escritorio de uso temporal, app propia y retorno externo; no altera el shell de Windows.
internal static class DesktopSessionProof
{
    internal static int Host(string directory, string pipe, int parentId)
    {
        HostBoundary.RequireInteractiveUser();
        using var parent = Process.GetProcessById(parentId);
        using var retained = new RetainedProcess(parent);
        using var bridge = new HostBridge(pipe, retained);
        ApplicationConfiguration.Initialize();
        using var window = new ShellWindow(Path.Combine(AppContext.BaseDirectory, "shell"), Path.Combine(directory, "use-profile"), bridge);
        using var desktops = new DesktopCoordinator(bridge, Path.Combine(directory, "lock-profile"), Path.Combine(directory, "PauseAudio.json"));
        window.NativeDelivery = desktops.Apply;
        window.ReadyReceived = () => File.WriteAllText(Path.Combine(directory, "parent-ready.json"), JsonSerializer.Serialize(new { LockName = desktops.LockName, Window = window.Handle.ToInt64() }));
        Application.Run(window); window.WaitForBridge(); return window.Failed ? 1 : 0;
    }

    internal static int Run(string directory)
    {
        HostBoundary.RequireInteractiveUser();
        if (Directory.Exists(directory)) return 1;
        Directory.CreateDirectory(directory);
        using var original = NativeDesktop.Current();
        using var use = NativeDesktop.Create("PopeLockUse" + Guid.NewGuid().ToString("N"));
        using var recovery = DesktopNative.Start(original.Name, "--restore", original.Name, directory);
        var name = PipeEndpoints.NewName();
        using var app = use.Start(Environment.ProcessPath!, "--window", "app", directory);
        using var parent = use.Start(Environment.ProcessPath!, "--desktop-session-host", directory, name, Environment.ProcessId.ToString());
        using var expected = new RetainedProcess(parent);
        using var pipe = PipeEndpoints.Create(name, expected);
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(45));
        Task? running = null; var report = new Dictionary<string, object?>(); var stage = "conexion";
        try
        {
            pipe.WaitForConnectionAsync(stop.Token).GetAwaiter().GetResult();
            if (!PipeEndpoints.IsHost(pipe, expected)) throw new UnauthorizedAccessException();
            using var session = new PipeSession(pipe, "shell-request", "bridge-event", () => PipeEndpoints.IsHost(pipe, expected), (_, _) => Task.CompletedTask);
            running = session.RunAsync(stop.Token);
            void Send(object state) => ProbeRun.Require(session.TrySend(JsonSerializer.SerializeToUtf8Bytes(new { version = 1, kind = "message", message = state, elapsedSeconds = 0 })), "Cola cerrada");
            Send(new { type = "state", status = "locked" });
            Until(() => File.Exists(Path.Combine(directory, "parent-ready.json")) && File.Exists(Path.Combine(directory, "lock-profile", "ready.json")), stop.Token);
            var lockName = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(Path.Combine(directory, "parent-ready.json"))).GetProperty("LockName").GetString()!;
            stage = "bloqueo"; report["ExpectedLock"] = lockName; report["ObservedInput"] = InputName(); report["ParentAlive"] = !parent.HasExited;
            Until(() => InputName() == lockName, stop.Token);
            report["LockedDesktop"] = lockName;
            report["NoExplorer"] = !DesktopNative.HasExplorer(use.DangerousGetHandle());
            var lockInfo = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(Path.Combine(directory, "lock-profile", "ready.json")));
            var lockWindow = lockInfo.GetProperty("Window").GetInt64();
            using (var locked = Open(lockName)) ProbeInput.On(locked.DangerousGetHandle(), () =>
            {
                ProbeInput.Focus((nint)lockWindow); ProbeInput.RestrictedShortcuts(); ProbeInput.AltTab();
                ProbeRun.Require(ProbeInput.ForegroundPid() == lockInfo.GetProperty("Pid").GetUInt32(), "Atajo sin sesión escapó");
            });
            report["LockedShortcuts"] = true;
            stage = "activar"; Send(Active(paused: false)); Until(() => InputName() == use.Name, stop.Token);
            Until(() => File.Exists(Path.Combine(directory, "app.jsonl")), stop.Token); Thread.Sleep(300);
            var before = ProbeRun.Read(directory, "app");
            stage = "entrada-activa"; ProbeInput.On(use.DangerousGetHandle(), () => { ProbeInput.Focus((nint)before.GetProperty("Window").GetInt64()); ProbeInput.Press(); });
            Until(() => ProbeRun.Read(directory, "app").GetProperty("Keys").GetInt32() > before.GetProperty("Keys").GetInt32() && ProbeRun.Read(directory, "app").GetProperty("Clicks").GetInt32() > before.GetProperty("Clicks").GetInt32(), stop.Token);
            var active = ProbeRun.Read(directory, "app");
            ProbeRun.Require(active.GetProperty("Keys").GetInt32() > before.GetProperty("Keys").GetInt32(), "Sin entrada activa");
            stage = "selector-cuenta"; Selector(use, parent, app); report["AccountAltTabBothWays"] = true;
            Send(new
            {
                type = "state",
                status = "active",
                vesRate = (object?)null,
                session = new { kind = "temporary", sessionId = "01900000-0000-7000-8000-000000000124", startedAt = "2026-10-12T00:00:00Z", name = "Temporal", purchasedSeconds = 100, remainingSeconds = 100 }
            });
            Thread.Sleep(300); stage = "selector-temporal"; Selector(use, parent, app); report["TemporaryAltTabBothWays"] = true;
            stage = "pausa"; Send(Active(paused: true)); Until(() => InputName() == lockName, stop.Token);
            Thread.Sleep(300); var paused = ProbeRun.Read(directory, "app");
            using (var locked = Open(lockName))
                ProbeInput.On(locked.DangerousGetHandle(), () => { ProbeInput.Focus((nint)lockWindow); ProbeInput.Press(); ProbeInput.AltTab(); });
            Thread.Sleep(300); var isolated = ProbeRun.Read(directory, "app");
            ProbeRun.Require(paused.GetProperty("Keys").GetInt32() == isolated.GetProperty("Keys").GetInt32() && paused.GetProperty("Clicks").GetInt32() == isolated.GetProperty("Clicks").GetInt32(), "Entrada escapó de pausa");
            ProbeRun.Require(!app.HasExited && isolated.GetProperty("HeartbeatMs").GetInt64() > paused.GetProperty("HeartbeatMs").GetInt64(), "Proceso pausado detenido");
            ProbeRun.Require(InputName() == lockName, "Alt+Tab escapó"); report["PauseIsolated"] = true;
            stage = "reanudar"; Send(Active(paused: false)); Until(() => InputName() == use.Name, stop.Token);
            ProbeInput.On(use.DangerousGetHandle(), () => { ProbeInput.Focus((nint)before.GetProperty("Window").GetInt64()); ProbeInput.Press(); });
            Until(() => ProbeRun.Read(directory, "app").GetProperty("Keys").GetInt32() > isolated.GetProperty("Keys").GetInt32(), stop.Token);
            var resumed = ProbeRun.Read(directory, "app");
            ProbeRun.Require(resumed.GetProperty("Keys").GetInt32() > isolated.GetProperty("Keys").GetInt32(), "Sin entrada reanudada");
            report["ResumedSameProcess"] = true;
            stage = "revocacion"; Send(new { type = "pcAuthenticationError", code = "pc_credential_revoked", message = "Credencial revocada" });
            Until(() => InputName() == lockName, stop.Token);
            using (var locked = Open(lockName)) ProbeInput.On(locked.DangerousGetHandle(), () => { ProbeInput.Focus((nint)lockWindow); ProbeInput.AltTab(); });
            ProbeRun.Require(InputName() == lockName && !app.HasExited, "Revocación perdió aislamiento"); report["RevocationIsolated"] = true;
            stage = "cierre"; Send(new { type = "state", status = "locked" }); Until(() => InputName() == lockName, stop.Token);
            report["Passed"] = true;
            report["Monitors"] = Screen.AllScreens.Length;
            using var lockProcess = Process.GetProcessById(lockInfo.GetProperty("Pid").GetInt32());
            parent.Refresh(); lockProcess.Refresh();
            report["HostWorkingSetBytes"] = parent.WorkingSet64 + lockProcess.WorkingSet64;
            report["HostPrivateBytes"] = parent.PrivateMemorySize64 + lockProcess.PrivateMemorySize64;
        }
        catch (Exception error)
        {
            report["Passed"] = false; report["Stage"] = stage; report["ErrorKind"] = error.GetType().Name;
            report["InnerKind"] = error.InnerException?.GetType().Name;
            report["WindowsError"] = (error.InnerException as System.ComponentModel.Win32Exception)?.NativeErrorCode;
        }
        finally
        {
            original.Activate(); report["Restored"] = InputName() == original.Name;
            stop.Cancel(); if (running != null) { try { running.GetAwaiter().GetResult(); } catch (OperationCanceledException) { } }
            foreach (var child in new[] { parent, app }) { if (!child.HasExited) child.Kill(true); child.WaitForExit(); }
            File.WriteAllText(Path.Combine(directory, "stop"), "T21 terminada"); recovery.WaitForExit(5000);
            File.WriteAllText(Path.Combine(directory, "report.json"), JsonSerializer.Serialize(report));
        }
        return report["Passed"] is true && report["Restored"] is true ? 0 : 1;
    }
    private static object Active(bool paused) => new
    {
        type = "state",
        status = "active",
        vesRate = (object?)null,
        session = new
        {
            kind = "account",
            sessionId = "01900000-0000-7000-8000-000000000124",
            startedAt = "2026-10-12T00:00:00Z",
            username = "Cliente",
            ratePerHour = new { micros = 1000000, currency = "USD" },
            money = new { micros = 1000000, currency = "USD" },
            moneySeconds = 100,
            comboSeconds = 0,
            remainingSeconds = 100,
            pause = paused ? new { startedAt = "2026-10-12T00:00:00Z", maxUntil = "2026-10-12T00:00:10Z", secondsLeft = 10, billing = false } : null
        }
    };
    private static void Until(Func<bool> condition, CancellationToken token)
    { while (!condition()) { token.ThrowIfCancellationRequested(); Thread.Sleep(50); } }
    private static void Selector(NativeDesktop use, Process parent, Process app) => ProbeInput.On(use.DangerousGetHandle(), () =>
    {
        ProbeInput.AltTab(); ProbeRun.Require(ProbeInput.ForegroundPid() == parent.Id, "Selector no llegó a Pope");
        ProbeInput.RestrictedShortcuts(); ProbeRun.Require(!parent.HasExited, "Alt+F4 cerró Pope");
        ProbeInput.AltTab(); ProbeRun.Require(ProbeInput.ForegroundPid() == app.Id, "Selector no volvió a la app");
    });
    private static string InputName()
    {
        var handle = DesktopNative.OpenInputDesktop(0, false, 0x20101);
        if (handle == 0) return "error:" + System.Runtime.InteropServices.Marshal.GetLastWin32Error();
        try { return DesktopNative.Name(handle); } finally { DesktopNative.CloseDesktop(handle); }
    }
    private static NativeDesktop Open(string name)
    {
        // El mismo nombre abre el objeto de bloqueo existente, con el mismo logon.
        return NativeDesktop.Create(name);
    }
}
