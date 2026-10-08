using System.ComponentModel;
using System.Diagnostics;
using System.ServiceProcess;
using System.Text.Json;
using Microsoft.Win32;

namespace Pope.DesktopProbe;

// Supervisor limitado fuera del job del broker: conserva bloqueo tras su muerte.
internal static class MaintenanceRunner
{
    internal static void RequireVm() => ProbeRun.Require(
        Registry.GetValue(@"HKEY_LOCAL_MACHINE\HARDWARE\DESCRIPTION\System\BIOS", "SystemProductName", null) is string product && product.Contains("VirtualBox", StringComparison.OrdinalIgnoreCase),
        "El ensayo elevado solo se permite en la VM VirtualBox aislada");

    internal static int Run(string id)
    {
        RequireVm();
        ProbeRun.Require(!DesktopNative.Elevated() && Environment.UserInteractive && Process.GetCurrentProcess().SessionId != 0,
            "El supervisor debe arrancar como usuario interactivo limitado");
        var directory = MaintenanceWindow.Evidence(id);
        ProbeRun.Require(!Directory.Exists(directory), "Usa un GUID nuevo de ensayo");
        Directory.CreateDirectory(directory);
        var original = DesktopNative.OpenInputDesktop(0, false, 0x20100);
        if (original == 0) throw new Win32Exception();
        nint fallback = 0;
        Process? window = null, installer = null;
        var report = new Dictionary<string, object?> { ["Utc"] = DateTime.UtcNow, ["Original"] = DesktopNative.Name(original) };
        try
        {
            File.WriteAllText(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "PopeT10-" + id + ".txt"), "Archivo previo T10 · conservar hasta comprobar salida");
            // UAC y el prompt privado requieren intervención humana; no inyecta entrada.
            installer = Process.Start(new ProcessStartInfo(Environment.ProcessPath!, "--install-maintenance " + id)
            { UseShellExecute = true, Verb = "runas", WindowStyle = ProcessWindowStyle.Hidden }) ?? throw new IOException("No se inició el configurador elevado");
            var time = Stopwatch.StartNew();
            while (!File.Exists(Path.Combine(directory, "started")))
            {
                if (installer.HasExited) throw new IOException("Configuración cancelada o fallida antes de iniciar el servicio");
                if (time.Elapsed.TotalMinutes > 20) throw new System.TimeoutException("Entrada privada no completada en 20 min");
                Thread.Sleep(200);
            }
            fallback = DesktopNative.Create("PopeFallback" + id);
            window = DesktopNative.Start("PopeFallback" + id, "--window", "lock", directory);
            time.Restart();
            while (!File.Exists(Path.Combine(directory, "lock.jsonl")) || !ProbeRun.Read(directory, "lock").GetProperty("Ready").GetBoolean())
            {
                if (window.HasExited || time.Elapsed.TotalSeconds > 40) throw new IOException("Bloqueo externo no estuvo listo");
                Thread.Sleep(200);
            }
            report["FallbackPid"] = window.Id;
            File.WriteAllText(Path.Combine(directory, "fallback-ready"), "Bloqueo fuera del job listo");
            using var service = new ServiceController(ProbeBroker.Name(id));
            var observedRunning = false;
            time.Restart();
            while (!File.Exists(Path.Combine(directory, "finished")))
            {
                if (time.Elapsed.TotalSeconds > 180) throw new System.TimeoutException("Ensayo excedió el plazo de recuperación");
                if (window.HasExited) throw new IOException("Se perdió la ventana de bloqueo externa");
                var running = false;
                try { service.Refresh(); running = service.Status == ServiceControllerStatus.Running; }
                catch (InvalidOperationException) { report["ServiceNoLongerPresent"] = true; }
                if (observedRunning && !running)
                {
                    ProbeRun.Switch(fallback);
                    if (File.Exists(Path.Combine(directory, "crash-killed.json")))
                    {
                        var killed = JsonSerializer.Deserialize<DateTime>(File.ReadAllText(Path.Combine(directory, "crash-killed.json")));
                        var elapsed = (DateTime.UtcNow - killed).TotalMilliseconds;
                        File.WriteAllText(Path.Combine(directory, "crash-recovery.json"), JsonSerializer.Serialize(new { RestoredToLock = true, Milliseconds = elapsed, FallbackAlive = !window.HasExited }));
                    }
                }
                observedRunning = running;
                Thread.Sleep(100);
            }
            report["InstallerExit"] = installer.WaitForExit(10000) ? installer.ExitCode : -1;
            var installation = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(Path.Combine(directory, "installer.json")));
            report["Passed"] = report["InstallerExit"] is 0 && new[] { "CredentialRemoved", "ServiceRemoved", "RootRemoved" }.All(
                key => installation.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.True);
        }
        catch (Exception error) { report["Error"] = error.ToString(); report["Passed"] = false; }
        finally
        {
            report["OriginalRestored"] = DesktopNative.SwitchDesktop(original);
            File.WriteAllText(Path.Combine(directory, "stop"), "Supervisor terminado");
            if (window != null) { if (!window.WaitForExit(5000)) window.Kill(entireProcessTree: true); window.Dispose(); }
            if (fallback != 0) DesktopNative.CloseDesktop(fallback);
            DesktopNative.CloseDesktop(original); installer?.Dispose();
            var sentinel = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "PopeT10-" + id + ".txt");
            report["SentinelPreserved"] = File.Exists(sentinel);
            if (File.Exists(sentinel)) File.Delete(sentinel); // Solo fixture propia; ningún archivo previo del usuario.
            File.WriteAllText(Path.Combine(directory, "runner.json"), JsonSerializer.Serialize(report));
        }
        return report.TryGetValue("Passed", out var passed) && passed is true && report["OriginalRestored"] is true ? 0 : 1;
    }
}
