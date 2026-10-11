using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Security.Principal;
using System.ServiceProcess;
using System.Text;
using System.Text.Json;
using Pope.Agent;

namespace Pope.DesktopProbe;

// T15 · REQ-003-02/63. Solo servicio demand propio, sin UI, conexión, cuentas ni shell.
internal static class AgentScmProbe
{
    private const string Acl = "O:SYG:SYD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)";
    internal static string Evidence(string id)
    {
        id = Guid.ParseExact(id, "N").ToString("N");
        var source = Path.GetDirectoryName(Environment.ProcessPath!)!;
        if (Path.GetFileName(source) != "probe" || Path.GetFileName(Path.GetDirectoryName(source)) != "dist")
            throw new InvalidOperationException("El ensayo exige la publicación dist/probe.");
        return Path.GetFullPath(Path.Combine(source, "..", "..", "..", "..", "tmp", "agent-service-" + id));
    }

    internal static int Denial(string id)
    {
        using var identity = WindowsIdentity.GetCurrent();
        var state = ProbeToken.Inspect(identity.Token);
        if (state.Elevated || identity.IsSystem || state.Integrity > 8192) return 1;
        var path = Path.Combine(AgentService.TestRoot(id), "configuration.bin");
        var readDenied = false;
        var writeDenied = false;
        try { File.ReadAllBytes(path); }
        catch (UnauthorizedAccessException) { readDenied = true; }
        try { using var file = new FileStream(path, FileMode.Open, FileAccess.Write); }
        catch (UnauthorizedAccessException) { writeDenied = true; }
        var result = new { ReadDenied = readDenied, WriteDenied = writeDenied, Token = state };
        File.WriteAllText(Path.Combine(Evidence(id), "denial.json"), JsonSerializer.Serialize(result));
        return readDenied && writeDenied ? 0 : 1;
    }

    internal static int Run(string id)
    {
        id = Guid.ParseExact(id, "N").ToString("N");
        if (!DesktopNative.Elevated()) { Console.Error.WriteLine("El ensayo SCM exige UAC local."); return 1; }
        var evidence = Evidence(id);
        var root = AgentService.TestRoot(id);
        var name = AgentService.TestName(id);
        if (!Directory.Exists(evidence) || File.ReadAllText(Path.Combine(evidence, "prepared")) != id ||
            Directory.Exists(root) || File.Exists(root) || Sc("query", name) != 1060)
            throw new InvalidOperationException("Ensayo no preparado o identificador ya usado.");
        var report = new Dictionary<string, object?> { ["Id"] = id, ["Utc"] = DateTime.UtcNow };
        var owned = false;
        var installed = false;
        ServiceController? service = null;
        string? credential = null;
        var stage = "custody";
        try
        {
            var plain = Configuration(out credential);
            try { AgentCustody.Store(root, plain); }
            catch
            {
                // Si falló después de crear su carpeta nueva, retirar solo una custodia verificada.
                if (Directory.Exists(root)) { AgentCustody.Verify(new DirectoryInfo(root)); owned = true; }
                throw;
            }
            finally { CryptographicOperations.ZeroMemory(plain); }
            owned = true;
            AgentCustody.Verify(new DirectoryInfo(root));
            AgentCustody.Verify(new FileInfo(Path.Combine(root, "configuration.bin")));
            var original = File.ReadAllBytes(Path.Combine(root, "configuration.bin"));
            report["NoPlaintext"] = original.AsSpan().IndexOf(Encoding.UTF8.GetBytes(credential)) < 0;
            stage = "publication";
            var source = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(Environment.ProcessPath!)!, "..", "agent"));
            var bin = Path.Combine(root, "bin");
            ProbePrivilege.Enable("SeRestorePrivilege");
            CopyProtected(source, bin);
            var executable = Path.Combine(bin, "Pope.Agent.exe");
            report["BinarySha256"] = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(executable)));
            if (Sc("create", name, "binPath=", $"\"{executable}\" --service-test {id}", "start=", "demand", "obj=", "LocalSystem") != 0)
                throw new InvalidOperationException("No se creó el servicio propio.");
            installed = true;
            stage = "start";
            service = new ServiceController(name);
            service.Start(); service.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(15));
            var status = Status(service);
            using (var token = ProbeToken.ForProcess((int)status.ProcessId))
            {
                report["ServiceToken"] = token.State;
                if (token.State.User != "S-1-5-18" || token.State.Session != 0) throw new InvalidOperationException("No es SYSTEM/sesión 0.");
            }
            File.WriteAllText(Path.Combine(evidence, "ready-denial"), id);
            stage = "denial";
            var deadline = Stopwatch.StartNew();
            while (!File.Exists(Path.Combine(evidence, "denial.json")))
            {
                if (deadline.Elapsed.TotalSeconds > 90) throw new System.TimeoutException("Falta la comprobación con token medio.");
                Thread.Sleep(100);
            }
            var denial = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(Path.Combine(evidence, "denial.json")));
            if (!denial.GetProperty("ReadDenied").GetBoolean() || !denial.GetProperty("WriteDenied").GetBoolean())
                throw new InvalidOperationException("La custodia no denegó al token medio.");
            var stopped = Stopwatch.StartNew();
            stage = "stop";
            Stop(service);
            report["StopMilliseconds"] = stopped.Elapsed.TotalMilliseconds;
            var damaged = original.ToArray(); damaged[0] ^= 255;
            stage = "corruption";
            File.WriteAllBytes(Path.Combine(root, "configuration.bin"), damaged);
            var rejected = false;
            try { service.Start(); service.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(5)); }
            catch (Win32Exception) { rejected = true; }
            catch (System.ServiceProcess.TimeoutException) { rejected = true; }
            service.Refresh();
            if (!rejected || service.Status != ServiceControllerStatus.Stopped) throw new InvalidOperationException("Aceptó configuración corrupta.");
            File.WriteAllBytes(Path.Combine(root, "configuration.bin"), original);
            stage = "restored-start";
            service.Start(); service.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(15));
            Stop(service);
            var log = File.ReadAllText(Path.Combine(root, "agent.log"));
            report["NoSecretsInLogs"] = !log.Contains(credential, StringComparison.Ordinal);
            report["CustodyVerified"] = true;
            report["CorruptionRejected"] = true;
            report["RestoredStartPassed"] = true;
            report["Passed"] = report["NoPlaintext"] is true && report["NoSecretsInLogs"] is true;
        }
        catch (Exception error)
        {
            report["Passed"] = false; report["FailureStage"] = stage; report["FailureType"] = error.GetType().Name;
            if (error is Win32Exception windows) report["NativeErrorCode"] = windows.NativeErrorCode;
        }
        finally
        {
            if (installed)
            {
                try { if (service != null) Stop(service); service?.Dispose(); service = null; report["ServiceRemoved"] = Sc("delete", name) == 0 && WaitAbsent(name); }
                catch { report["ServiceRemoved"] = false; }
            }
            if (owned && (!installed || report["ServiceRemoved"] is true))
            {
                try
                {
                    // Ruta absoluta por GUID, owner/DACL y ausencia de reanálisis antes de borrar solo este árbol.
                    AgentCustody.Verify(new DirectoryInfo(root));
                    for (var attempt = 0; ; attempt++)
                    {
                        try { Directory.Delete(root, recursive: true); break; }
                        catch (IOException) when (attempt < 24) { Thread.Sleep(200); }
                    }
                    report["RootRemoved"] = !Directory.Exists(root);
                }
                catch { report["RootRemoved"] = false; }
            }
            service?.Dispose();
            report["Passed"] = report.TryGetValue("Passed", out var passed) && passed is true &&
                report.TryGetValue("ServiceRemoved", out var removed) && removed is true &&
                report.TryGetValue("RootRemoved", out var rootRemoved) && rootRemoved is true;
            File.WriteAllText(Path.Combine(evidence, "report.json"), JsonSerializer.Serialize(report));
            File.WriteAllText(Path.Combine(evidence, "finished"), id);
        }
        return report["Passed"] is true ? 0 : 1;
    }

    private static byte[] Configuration(out string credential)
    {
        using var key = RSA.Create(2048);
        var request = new CertificateRequest("CN=localhost", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        var names = new SubjectAlternativeNameBuilder(); names.AddDnsName("localhost"); request.CertificateExtensions.Add(names.Build());
        using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddDays(1));
        credential = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        return JsonSerializer.SerializeToUtf8Bytes(new
        {
            version = 1,
            pcId = "01900000-0000-7000-8000-000000000123",
            pcName = "PC fixture SCM",
            nodeUrl = "https://localhost:9",
            nodeCertificate = Convert.ToBase64String(certificate.RawData),
            credential
        });
    }

    private static void CopyProtected(string source, string target)
    {
        if ((File.GetAttributes(source) & FileAttributes.ReparsePoint) != 0) throw new IOException("Publicación con reanálisis.");
        var security = new DirectorySecurity(); security.SetSecurityDescriptorSddlForm(Acl);
        new DirectoryInfo(target).Create(security);
        foreach (var file in Directory.GetFiles(source))
        {
            if ((File.GetAttributes(file) & FileAttributes.ReparsePoint) != 0) throw new IOException("Publicación con reanálisis.");
            var destination = Path.Combine(target, Path.GetFileName(file)); File.Copy(file, destination);
            var fileSecurity = new FileSecurity(); fileSecurity.SetSecurityDescriptorSddlForm("O:SYG:SYD:P(A;;FA;;;SY)(A;;FA;;;BA)");
            new FileInfo(destination).SetAccessControl(fileSecurity);
        }
        foreach (var directory in Directory.GetDirectories(source)) CopyProtected(directory, Path.Combine(target, Path.GetFileName(directory)));
    }
    private static void Stop(ServiceController service)
    {
        service.Refresh();
        if (service.Status == ServiceControllerStatus.Stopped) return;
        service.Stop(); service.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(15));
    }
    private static bool WaitAbsent(string name)
    {
        for (var n = 0; n < 50; n++) { if (Sc("query", name) == 1060) return true; Thread.Sleep(100); }
        return false;
    }
    private static int Sc(params string[] arguments)
    {
        var start = new ProcessStartInfo("sc.exe") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        using var process = Process.Start(start)!;
        var output = process.StandardOutput.ReadToEndAsync(); var error = process.StandardError.ReadToEndAsync();
        if (!process.WaitForExit(15_000)) throw new System.TimeoutException("SCM no respondió.");
        Task.WaitAll(output, error); return process.ExitCode;
    }
    private static ServiceStatus Status(ServiceController service)
    {
        if (!QueryServiceStatusEx(service.ServiceHandle.DangerousGetHandle(), 0, out var status, (uint)Marshal.SizeOf<ServiceStatus>(), out _)) throw new Win32Exception();
        return status;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct ServiceStatus { internal uint Type, State, Controls, Exit, SpecificExit, Checkpoint, WaitHint, ProcessId, Flags; }
    // Consulta solo estado/PID del servicio propio para comprobar su token real; no cambia servicios.
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool QueryServiceStatusEx(nint service, int level, out ServiceStatus status, uint length, out uint needed);
}
