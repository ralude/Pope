using System.Diagnostics;
using System.Security.AccessControl;
using System.ServiceProcess;
using System.Text.Json;

namespace Pope.DesktopProbe;

internal static class ProbeInstall
{
    internal static int Run(string id)
    {
        if (!DesktopNative.Elevated() || Process.GetCurrentProcess().SessionId == 0)
            throw new InvalidOperationException("Instalación del ensayo requiere elevación interactiva en la VM");
        var root = ProbeCredential.Root(id);
        var evidence = MaintenanceWindow.Evidence(id);
        var report = new Dictionary<string, object?> { ["Utc"] = DateTime.UtcNow };
        var installed = false;
        try
        {
            ProbeRun.Require(Directory.Exists(evidence), "Debe iniciar primero el runner limitado");
            var configured = ProbeCredential.Configure(id);
            if (configured != 0) { report["Cancelled"] = true; return configured; }
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
            File.WriteAllText(Path.Combine(root, "phase"), "normal");
            StartAndWait(service, root);
            Export(root, evidence, "normal");
            var helper = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(Path.Combine(root, "helper.json")));
            report["NormalPassed"] = helper.TryGetProperty("Passed", out var passed) && passed.GetBoolean();
            return report["NormalPassed"] is true ? 0 : 1;
        }
        catch (Exception error) { report["Error"] = error.ToString(); return 1; }
        finally
        {
            if (!installed && Directory.Exists(root))
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
                try { Directory.Delete(root, recursive: true); report["RootRemoved"] = true; }
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
    private static void StartAndWait(ServiceController service, string root)
    {
        var report = Path.Combine(root, "broker.json");
        if (File.Exists(report)) File.Delete(report);
        service.Start();
        var time = Stopwatch.StartNew();
        while (time.Elapsed.TotalSeconds < 130)
        {
            service.Refresh();
            if (service.Status == ServiceControllerStatus.Stopped && File.Exists(report)) return;
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
