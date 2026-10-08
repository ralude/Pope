using System.Diagnostics;
using System.Security.Principal;
using System.ServiceProcess;
using System.Text.Json;

namespace Pope.DesktopProbe;

internal sealed class ProbeBroker(string id) : ServiceBase
{
    internal static string Name(string id) => "PopeMaintenanceProbe-" + Guid.ParseExact(id, "N").ToString("N");
    private ProbeLaunch? job;
    protected override void OnStart(string[] args)
    {
        _ = Task.Run(() =>
        {
            var report = new Dictionary<string, object?> { ["Utc"] = DateTime.UtcNow, ["BrokerSession"] = Process.GetCurrentProcess().SessionId };
            try
            {
                using var identity = WindowsIdentity.GetCurrent();
                ProbeRun.Require(identity.IsSystem && Process.GetCurrentProcess().SessionId == 0, "El broker exige SYSTEM en sesión 0");
                foreach (var privilege in new[] { "SeTcbPrivilege", "SeAssignPrimaryTokenPrivilege", "SeIncreaseQuotaPrivilege", "SeBackupPrivilege", "SeRestorePrivilege" })
                    ProbePrivilege.Enable(privilege);
                var phase = File.ReadAllText(Path.Combine(ProbeCredential.Root(id), "phase"));
                if (phase == "cleanup")
                {
                    if (File.Exists(Path.Combine(ProbeCredential.Root(id), "admin-logon")))
                    {
                        using var recoveryToken = ProbeToken.SystemInSession(ProbeToken.ConsoleSession());
                        using var recoveryJob = new ProbeLaunch();
                        var recovery = recoveryJob.Start(recoveryToken, Environment.ProcessPath!, "Default", 0, "--maintenance-cleanup", id);
                        ProbeRun.Require(recovery.WaitForExit(10000) && recovery.ExitCode == 0, "No se retiraron los permisos temporales");
                    }
                    ProbeCredential.Clean(id); report["Cleaned"] = true; return;
                }
                ProbeRun.Require(phase is "normal" or "crash", "Fase de ensayo no admitida");
                if (File.Exists(Path.Combine(ProbeCredential.Root(id), "pending.bin"))) ProbeCredential.Import(id);
                var session = ProbeToken.ConsoleSession();
                ProbeRun.Require(session is not 0 and not uint.MaxValue, "No hay consola interactiva");
                using var token = ProbeToken.SystemInSession(session);
                File.WriteAllText(Path.Combine(ProbeCredential.Root(id), "broker-pid"), Environment.ProcessId.ToString());
                job = new ProbeLaunch();
                var child = job.Start(token, Environment.ProcessPath!, "Default", 0, "--maintenance-helper", id);
                report["HelperPid"] = child.Id;
                if (!child.WaitForExit(120000)) throw new System.TimeoutException("El ayudante excedió 120 s");
                report["HelperExit"] = child.ExitCode;
            }
            catch (Exception error) { report["Error"] = error.ToString(); }
            finally
            {
                Interlocked.Exchange(ref job, null)?.Dispose();
                File.WriteAllText(Path.Combine(ProbeCredential.Root(id), "broker.json"), JsonSerializer.Serialize(report));
                Stop();
            }
        });
    }
    protected override void OnStop() => Interlocked.Exchange(ref job, null)?.Dispose();

    internal static int Helper(string id)
    {
        var report = new Dictionary<string, object?> { ["Utc"] = DateTime.UtcNow, ["HelperSession"] = Process.GetCurrentProcess().SessionId };
        nint fallback = 0;
        try
        {
            using var identity = WindowsIdentity.GetCurrent();
            ProbeRun.Require(identity.IsSystem && Process.GetCurrentProcess().SessionId != 0, "Ayudante SYSTEM sin GUI en consola requerido");
            foreach (var privilege in new[] { "SeTcbPrivilege", "SeAssignPrimaryTokenPrivilege", "SeIncreaseQuotaPrivilege", "SeBackupPrivilege", "SeRestorePrivilege" })
                ProbePrivilege.Enable(privilege);
            fallback = DesktopNative.OpenDesktop("PopeFallback" + id, 0, false, 0x100);
            if (fallback == 0) throw new System.ComponentModel.Win32Exception();
            ProbeRun.Switch(fallback);
            report["Custody"] = ProbeCredential.Verify(id);
            using var credential = ProbeCredential.Read(id);
            using var admin = ProbeToken.Logon(credential, ProbeToken.ConsoleSession());
            File.WriteAllText(Path.Combine(ProbeCredential.Root(id), "admin-logon"), admin.State.Logon!);
            using var client = ProbeToken.ConsoleUser(ProbeToken.ConsoleSession());
            report["Admin"] = admin.State; report["Client"] = client.State;
            ProbeRun.Require(admin.State.Logon != client.State.Logon, "Se reutilizó el inicio de sesión cliente");
            report["TokensPassed"] = true;
            if (File.ReadAllText(Path.Combine(ProbeCredential.Root(id), "phase")) == "crash") MaintenanceRun.Crash(id, admin);
            else MaintenanceRun.Run(id, admin, client, report);
            return 0;
        }
        catch (Exception error) { report["Error"] = error.ToString(); return 1; }
        finally
        {
            if (fallback != 0) { report["Fallback"] = DesktopNative.SwitchDesktop(fallback); DesktopNative.CloseDesktop(fallback); }
            File.WriteAllText(Path.Combine(ProbeCredential.Root(id), "helper.json"), JsonSerializer.Serialize(report));
        }
    }

    internal static int CleanupHelper(string id)
    {
        using var identity = WindowsIdentity.GetCurrent();
        ProbeRun.Require(identity.IsSystem && Process.GetCurrentProcess().SessionId != 0, "Recuperación reservada al ayudante SYSTEM de consola");
        ProbeDesktop.Recover(File.ReadAllText(Path.Combine(ProbeCredential.Root(id), "admin-logon")));
        return 0;
    }
}
