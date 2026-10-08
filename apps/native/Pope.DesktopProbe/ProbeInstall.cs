using System.Diagnostics;
using System.Security.AccessControl;
using System.ServiceProcess;
using System.Text.Json;

namespace Pope.DesktopProbe;

internal static class ProbeInstall
{
    internal static int Run(string id)
    {
        MaintenanceRunner.RequireVm();
        if (!DesktopNative.Elevated() || Process.GetCurrentProcess().SessionId == 0)
            throw new InvalidOperationException("Instalación del ensayo requiere elevación interactiva en la VM");
        var root = ProbeCredential.Root(id);
        var evidence = MaintenanceWindow.Evidence(id);
        var report = new Dictionary<string, object?> { ["Utc"] = DateTime.UtcNow };
        var installed = false;
        var owned = false;
        try
        {
            ProbeRun.Require(Directory.Exists(evidence), "Debe iniciar primero el runner limitado");
            var configured = ProbeCredential.Configure(id);
            if (configured != 0) { report["Cancelled"] = true; return configured; }
            owned = true;
            var target = Path.Combine(root, "bin");
            var security = new DirectorySecurity();
            security.SetSecurityDescriptorSddlForm("O:SYG:SYD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;FRFX;;;BU)");
            new DirectoryInfo(target).Create(security);
            var source = Path.GetDirectoryName(Environment.ProcessPath!)!;
            foreach (var file in Directory.EnumerateFiles(source))
                File.Copy(file, Path.Combine(target, Path.GetFileName(file)));
            foreach (var folder in Directory.EnumerateDirectories(source))
                CopyFolder(folder, Path.Combine(target, Path.GetFileName(folder)));
            var executable = Path.Combine(target, Path.GetFileName(Environment.ProcessPath!));
            Sc("create", ProbeBroker.Name(id), "binPath=", $"\"{executable}\" --maintenance-service {id}", "start=", "demand");
            installed = true;
            using var service = new ServiceController(ProbeBroker.Name(id));
            File.WriteAllText(Path.Combine(evidence, "started"), "Ensayo elevado iniciado");
            var readyTime = Stopwatch.StartNew();
            while (!File.Exists(Path.Combine(evidence, "fallback-ready")))
            {
                if (readyTime.Elapsed.TotalSeconds > 45) throw new System.TimeoutException("Supervisor no preparó bloqueo externo");
                Thread.Sleep(200);
            }
            File.WriteAllText(Path.Combine(root, "phase"), "normal");
            StartAndWait(service, root);
            Export(root, evidence, "normal");
            var helper = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(Path.Combine(root, "helper.json")));
            report["NormalPassed"] = helper.TryGetProperty("Passed", out var passed) && passed.GetBoolean();
            if (report["NormalPassed"] is true)
            {
                File.WriteAllText(Path.Combine(root, "phase"), "crash");
                foreach (var role in new[] { "admin", "child" }) File.Delete(Path.Combine(evidence, role + ".jsonl"));
                StartAndWait(service, root, evidence);
                var state = JsonSerializer.Deserialize<int[]>(File.ReadAllText(Path.Combine(root, "crash-state.json")))!;
                report["CrashChildrenEnded"] = state.All(pid =>
                {
                    try { using var process = Process.GetProcessById(pid); return process.WaitForExit(5000); }
                    catch (ArgumentException) { return true; }
                });
                var time = Stopwatch.StartNew();
                var recovered = Path.Combine(evidence, "crash-recovery.json");
                while (!File.Exists(recovered) && time.Elapsed.TotalSeconds < 5) Thread.Sleep(100);
                ProbeRun.Require(File.Exists(recovered), "Supervisor no confirmó regreso a bloqueo tras fallo del broker");
                var recovery = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(recovered));
                report["CrashRecovery"] = recovery;
                report["CrashPassed"] = report["CrashChildrenEnded"] is true && recovery.GetProperty("FallbackAlive").GetBoolean() &&
                    recovery.GetProperty("RestoredToLock").GetBoolean() && recovery.GetProperty("Milliseconds").GetDouble() is >= 0 and < 3000;
            }
            return report.TryGetValue("CrashPassed", out var crashPassed) && crashPassed is true ? 0 : 1;
        }
        catch (Exception error) { report["Error"] = error.ToString(); return 1; }
        finally
        {
            if (!installed && owned && Directory.Exists(root))
            {
                try { Directory.Delete(root, recursive: true); report["UninstalledStagingRemoved"] = true; }
                catch (Exception error) { report["StagingCleanupError"] = error.ToString(); }
            }
            if (installed)
            {
                try
                {
                    using var service = new ServiceController(ProbeBroker.Name(id));
                    service.Refresh();
                    if (service.Status != ServiceControllerStatus.Stopped) { service.Stop(); service.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(15)); }
                    File.WriteAllText(Path.Combine(root, "phase"), "cleanup");
                    StartAndWait(service, root);
                    report["CredentialRemoved"] = !File.Exists(Path.Combine(root, "Maintenance", "credential.bin"));
                    Sc("delete", ProbeBroker.Name(id));
                    report["ServiceRemoved"] = true;
                }
                catch (Exception error) { report["CleanupError"] = error.ToString(); }
            }
            if (report.TryGetValue("CredentialRemoved", out var removed) && removed is true)
            {
                // Root se obtiene exclusivamente de GUID validado; no acepta rutas del Shell.
                try
                {
                    for (var attempt = 0; attempt < 25; attempt++)
                    {
                        try { Directory.Delete(root, recursive: true); report["RootRemoved"] = true; break; }
                        catch (IOException) when (attempt < 24) { Thread.Sleep(200); }
                    }
                }
                catch (Exception error) { report["RootCleanupError"] = error.ToString(); }
            }
            File.WriteAllText(Path.Combine(evidence, "installer.json"), JsonSerializer.Serialize(report));
            File.WriteAllText(Path.Combine(evidence, "finished"), "Instalador terminó");
        }
    }

    private static void CopyFolder(string source, string target)
    {
        Directory.CreateDirectory(target);
        foreach (var file in Directory.EnumerateFiles(source)) File.Copy(file, Path.Combine(target, Path.GetFileName(file)));
        foreach (var folder in Directory.EnumerateDirectories(source)) CopyFolder(folder, Path.Combine(target, Path.GetFileName(folder)));
    }
    private static void StartAndWait(ServiceController service, string root, string? crashEvidence = null)
    {
        var report = Path.Combine(root, "broker.json");
        if (File.Exists(report)) File.Delete(report);
        service.Start();
        var time = Stopwatch.StartNew();
        while (time.Elapsed.TotalSeconds < 130)
        {
            service.Refresh();
            if (service.Status == ServiceControllerStatus.Stopped && (File.Exists(report) || crashEvidence != null && File.Exists(Path.Combine(crashEvidence, "crash-killed.json")))) return;
            if (crashEvidence != null && File.Exists(Path.Combine(crashEvidence, "crash-ready")) && !File.Exists(Path.Combine(crashEvidence, "crash-killed.json")))
            {
                var pid = int.Parse(File.ReadAllText(Path.Combine(root, "broker-pid")));
                using var broker = Process.GetProcessById(pid);
                ProbeRun.Require(broker.MainModule!.FileName == Path.Combine(root, "bin", Path.GetFileName(Environment.ProcessPath!)), "El PID no corresponde al broker propio");
                File.WriteAllText(Path.Combine(crashEvidence, "crash-killed.json"), JsonSerializer.Serialize(DateTime.UtcNow));
                broker.Kill(); broker.WaitForExit(5000);
            }
            Thread.Sleep(200);
        }
        throw new System.TimeoutException("Servicio de ensayo excedió 130 s");
    }
    private static void Export(string root, string evidence, string phase)
    {
        foreach (var role in new[] { "broker", "helper" })
        {
            var path = Path.Combine(root, role + ".json");
            if (File.Exists(path)) File.Copy(path, Path.Combine(evidence, role + "-" + phase + ".json"), overwrite: true);
        }
    }
    private static void Sc(params string[] arguments)
    {
        var start = new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "sc.exe"))
        { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        using var command = Process.Start(start) ?? throw new IOException("SCM no inició");
        var output = command.StandardOutput.ReadToEnd();
        var error = command.StandardError.ReadToEnd();
        if (!command.WaitForExit(15000) || command.ExitCode != 0) throw new IOException("SCM falló: " + output + error);
    }
}
