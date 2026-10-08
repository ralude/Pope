using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace Pope.DesktopProbe;

internal static class ProbeDenial
{
    internal static int Run(string id)
    {
        var report = new Dictionary<string, object?>();
        try
        {
            ProbeRun.Require(!DesktopNative.Elevated(), "Comprobación de aislamiento exige token cliente limitado");
            var name = "PopeAdmin" + Guid.ParseExact(id, "N").ToString("N");
            foreach (var access in new uint[] { 0x41, 0x100 })
            {
                var handle = DesktopNative.OpenDesktop(name, 0, false, access);
                var error = Marshal.GetLastWin32Error();
                if (handle != 0) DesktopNative.CloseDesktop(handle);
                report["DesktopDenied" + access] = handle == 0 && error == 5;
                ProbeRun.Require(handle == 0 && error == 5, "El cliente puede acceder al escritorio administrativo");
            }
            var path = Path.Combine(ProbeCredential.Root(id), "Maintenance", "credential.bin");
            try { using var readable = File.OpenRead(path); throw new InvalidOperationException("El cliente leyó la credencial protegida"); }
            catch (UnauthorizedAccessException) { report["SecretDenied"] = true; }
            var pid = ProbeRun.Read(MaintenanceWindow.Evidence(id), "admin").GetProperty("Pid").GetInt32();
            var process = OpenProcess(0x400, false, (uint)pid);
            var denied = process == 0 && Marshal.GetLastWin32Error() == 5;
            if (process != 0)
            {
                try
                {
                    var opened = OpenProcessToken(process, 0xA, out var token);
                    denied = !opened && Marshal.GetLastWin32Error() == 5;
                    if (opened) CloseHandle(token);
                }
                finally { CloseHandle(process); }
            }
            report["DuplicateAdminTokenDenied"] = denied;
            ProbeRun.Require(denied, "El cliente puede duplicar el token administrativo");
            report["Passed"] = true; return 0;
        }
        catch (Exception error) { report["Error"] = error.ToString(); return 1; }
        finally { File.WriteAllText(Path.Combine(MaintenanceWindow.Evidence(id), "denial.json"), JsonSerializer.Serialize(report)); }
    }
    // Solicita acceso para duplicar el token del proceso propio administrativo de prueba.
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern nint OpenProcess(uint access, bool inherit, uint pid);
    // Debe fallar desde el cliente; no usa el token obtenido para ejecutar nada.
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool OpenProcessToken(nint process, uint access, out nint token);
    // Libera solo handles adquiridos por esta comprobación de permisos.
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(nint handle);
}
