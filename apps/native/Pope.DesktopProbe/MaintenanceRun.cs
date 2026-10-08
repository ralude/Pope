using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Text.Json;

namespace Pope.DesktopProbe;

internal static class MaintenanceRun
{
    internal static void Run(string id, ProbeToken admin, ProbeToken client, Dictionary<string, object?> report)
    {
        var directory = MaintenanceWindow.Evidence(id);
        using var adminProfile = new ProbeProfile(admin, load: true);
        using var clientProfile = new ProbeProfile(client, load: false);
        using var administrative = new ProbeDesktop("PopeAdmin" + id, admin.State.Logon!);
        using var usage = new ProbeDesktop("PopeClient" + id, client.State.Logon!);
        var locked = DesktopNative.OpenDesktop("PopeFallback" + id, 0, false, DesktopNative.DesktopAccess);
        if (locked == 0) throw new Win32Exception();
        var originalExplorers = Process.GetProcessesByName("explorer").Select(process =>
        { using (process) return process.Id; }).ToArray();
        report["OriginalExplorerPids"] = originalExplorers;
        report["AdminProfile"] = adminProfile.Path; report["ClientProfile"] = clientProfile.Path;
        report["SameAccountInVm"] = admin.State.User == client.State.User;
        report["AdminAcl"] = DesktopNative.Acl(administrative.Handle);
        var sentinel = Path.Combine(adminProfile.Path, "PopeT10-" + id + ".txt");
        var saved = File.Exists(sentinel) ? File.ReadAllBytes(sentinel) : null;
        try
        {
            ProbeRun.Require(!DesktopNative.Acl(administrative.Handle).Contains(admin.State.User), "Escritorio administrativo concedido por SID genérico");
            InvalidCredentials(report);
            using var clientJob = new ProbeLaunch();
            var web = clientJob.Start(client, Environment.ProcessPath!, usage.Name, clientProfile.EnvironmentBlock, "--window", "use", directory);
            Wait(directory, "use");
            using (var administrativeJob = new ProbeLaunch())
            {
                var window = administrativeJob.Start(admin, Environment.ProcessPath!, administrative.Name, adminProfile.EnvironmentBlock,
                    "--maintenance-window", id, "admin");
                Wait(directory, "admin"); Wait(directory, "child");
                var state = ProbeRun.Read(directory, "admin");
                var childState = ProbeRun.Read(directory, "child");
                VerifyWindow(state, admin.State, administrative.Name, adminProfile.Path);
                VerifyWindow(childState, admin.State, administrative.Name, adminProfile.Path);
                using var child = Process.GetProcessById(childState.GetProperty("Pid").GetInt32());
                ProbeRun.Require(administrativeJob.Contains(window) && administrativeJob.Contains(child), "Padre/hijo fuera del job");
                report["AdminWindow"] = state; report["AdminChild"] = childState;
                var denial = clientJob.Start(client, Environment.ProcessPath!, usage.Name, clientProfile.EnvironmentBlock, "--maintenance-denial", id);
                ProbeRun.Require(denial.WaitForExit(10000) && denial.ExitCode == 0, "Falló el aislamiento desde el cliente");
                report["Denial"] = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(Path.Combine(directory, "denial.json")));
                ProbeRun.Switch(usage.Handle);
                var before = ProbeRun.Read(directory, "use");
                ProbeRun.Switch(administrative.Handle);
                Thread.Sleep(1000);
                ProbeRun.Capture(administrative.Handle, directory, "maintenance");
                ProbeRun.Switch(locked);
                Thread.Sleep(500);
                var after = ProbeRun.Read(directory, "use");
                ProbeRun.Require(!after.GetProperty("Elevated").GetBoolean() && after.GetProperty("Pid").GetInt32() == web.Id &&
                    after.GetProperty("HeartbeatMs").GetInt64() > before.GetProperty("HeartbeatMs").GetInt64(), "WebView2 dejó de continuar limitado");
                report["WebViewContinuity"] = true;
            }
            var own = new[] { report["AdminWindow"], report["AdminChild"] }.Cast<JsonElement>().Select(value => value.GetProperty("Pid").GetInt32()).ToArray();
            ProbeRun.Require(own.All(Ended), "Quedaron procesos administrativos propios");
            report["OwnParentChildClosed"] = true;
            ProbeRun.Require(originalExplorers.All(pid => !Ended(pid)), "Terminó un Explorer previo ajeno al mantenimiento");
            ProbeRun.Require(saved == null || File.ReadAllBytes(sentinel).SequenceEqual(saved), "Se alteró el archivo previo");
            report["PriorProcessesAndDataPreserved"] = true;

            // Explorer puede reutilizar otro proceso o deselevarse: eso invalida la ruta.
            using var explorerJob = new ProbeLaunch();
            var explorer = explorerJob.Start(admin, Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "explorer.exe"),
                administrative.Name, adminProfile.EnvironmentBlock);
            Thread.Sleep(5000);
            report["ExplorerLaunchedPid"] = explorer.Id;
            report["ExplorerExited"] = explorer.HasExited;
            ProbeRun.Require(!explorer.HasExited, "Explorer terminó o delegó en otro proceso; escritorio administrativo completo sin demostrar");
            using var explorerIdentity = ProcessIdentity(explorer);
            var effective = ProbeToken.Inspect(explorerIdentity.Token);
            report["ExplorerToken"] = effective;
            ProbeRun.Require(effective.Elevated && effective.Logon == admin.State.Logon && effective.User == admin.State.User,
                "Explorer no conserva el token/logon administrativo");
            ProbeRun.Require(explorerJob.Contains(explorer) && DesktopNative.HasExplorer(administrative.Handle), "Explorer no está en el escritorio/job administrativo");
            report["ExplorerPassed"] = true;
            report["Passed"] = true;
        }
        finally
        {
            report["ReturnedToLock"] = DesktopNative.SwitchDesktop(locked);
            DesktopNative.CloseDesktop(locked);
        }
    }

    private static void VerifyWindow(JsonElement state, ProbeToken.TokenState expected, string desktop, string profile)
    {
        var token = state.GetProperty("Token");
        ProbeRun.Require(token.GetProperty("User").GetString() == expected.User && token.GetProperty("Logon").GetString() == expected.Logon &&
            token.GetProperty("Elevated").GetBoolean() && token.GetProperty("Integrity").GetInt32() >= 12288 &&
            token.GetProperty("Session").GetUInt32() == expected.Session, "Token de ventana incorrecto");
        ProbeRun.Require(state.GetProperty("Desktop").GetString() == desktop &&
            string.Equals(state.GetProperty("Profile").GetString(), profile, StringComparison.OrdinalIgnoreCase), "Escritorio/perfil de ventana incorrecto");
    }
    private static bool Ended(int pid)
    {
        try { using var process = Process.GetProcessById(pid); return process.HasExited; }
        catch (ArgumentException) { return true; }
    }
    private static void Wait(string directory, string role)
    {
        var time = Stopwatch.StartNew();
        while (time.Elapsed.TotalSeconds < 40)
        {
            if (File.Exists(Path.Combine(directory, role + ".jsonl")) && ProbeRun.Read(directory, role).GetProperty("Ready").GetBoolean()) return;
            Thread.Sleep(200);
        }
        throw new TimeoutException("Ventana no preparada: " + role);
    }
    private static void InvalidCredentials(Dictionary<string, object?> report)
    {
        // Un único usuario ficticio inexistente: no bloquea una cuenta real por intentos.
        var invalid = Encoding.Unicode.GetBytes("PopeMissing-" + Guid.NewGuid().ToString("N") + "\0Clave ficticia\0");
        using var credential = new ProbeCredential.CredentialBuffer(invalid);
        try { using var token = ProbeToken.Logon(credential, ProbeToken.ConsoleSession()); throw new InvalidOperationException("Windows aceptó credenciales ficticias"); }
        catch (Win32Exception error) { report["InvalidCredentialError"] = error.NativeErrorCode; }
    }
    private static WindowsIdentity ProcessIdentity(Process process)
    {
        if (!OpenProcessToken(process.Handle, 8, out var token)) throw new Win32Exception();
        try { return new WindowsIdentity(token); }
        finally { CloseHandle(token); }
    }
    // Lee el token de Explorer con permisos SYSTEM para comprobar el resultado real.
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool OpenProcessToken(nint process, uint access, out nint token);
    // Libera únicamente el handle de token consultado; WindowsIdentity duplica el suyo.
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(nint handle);
}
