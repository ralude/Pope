using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace Pope.Agent;

// REQ-003-34: enumeración y cierre de procesos con APIs Win32 comentadas; sin paquetes.
internal static class ClientProcesses
{
    private const uint QueryLimited = 0x1000;   // PROCESS_QUERY_LIMITED_INFORMATION
    private const uint Terminate = 0x0001;      // PROCESS_TERMINATE
    private const uint Synchronize = 0x100000;  // SYNCHRONIZE, para esperar la salida
    private const int MaximumProcesses = 8_192;

    internal static List<ProcessEntry> Snapshot()
    {
        var entries = new List<ProcessEntry>();
        using var snapshot = CreateToolhelp32Snapshot(2, 0);
        if (snapshot.IsInvalid) throw new Win32Exception();
        var entry = new ProcessEntry32 { Size = Marshal.SizeOf<ProcessEntry32>() };
        for (var more = Process32First(snapshot, ref entry); more && entries.Count < MaximumProcesses; more = Process32Next(snapshot, ref entry))
        {
            if (entry.Pid is 0 or 4) continue; // Inactivo y System: nunca del cliente.
            if (Describe(entry.Pid, entry.ParentPid) is { } described) entries.Add(described);
        }
        return entries;
    }

    // Datos de un proceso vivo; null si terminó o Windows no permite consultarlo (protegidos).
    internal static ProcessEntry? Describe(uint pid, uint parent = 0)
    {
        // Con SYNCHRONIZE se distingue un proceso ya terminado cuyo objeto sigue abierto por otro
        // handle (misma hora de creación); si Windows lo deniega, basta la consulta limitada.
        var process = OpenProcess(QueryLimited | Synchronize, false, pid);
        if (process.IsInvalid) { process.Dispose(); process = OpenProcess(QueryLimited, false, pid); }
        using var owned = process;
        if (process.IsInvalid || WaitForSingleObject(process, 0) == 0) return null;
        if (!GetProcessTimes(process, out var created, out _, out _, out _) || !ProcessIdToSessionId(pid, out var session)) return null;
        string? user = null;
        if (OpenProcessToken(process, 8, out var token))
            using (token)
            {
                try { using var identity = new WindowsIdentity(token.DangerousGetHandle()); user = identity.User?.Value; }
                catch (Exception error) when (error is UnauthorizedAccessException or System.Security.SecurityException or ArgumentException) { }
            }
        var text = new StringBuilder(1024); var length = text.Capacity;
        var image = QueryFullProcessImageName(process, 0, text, ref length) ? text.ToString(0, length) : null;
        var critical = IsProcessCritical(process, out var isCritical) && isCritical;
        return new ProcessEntry(pid, parent, created, session, user, image, critical);
    }

    // Termina solo si el PID sigue siendo el mismo proceso (misma hora de creación).
    internal static bool Close(ProcessEntry target)
    {
        using var process = OpenProcess(Terminate | QueryLimited | Synchronize, false, target.Pid);
        if (process.IsInvalid) return Marshal.GetLastWin32Error() == 87; // Ya no existe.
        if (!GetProcessTimes(process, out var created, out _, out _, out _) || created != target.Created) return true;
        if (IsProcessCritical(process, out var critical) && critical) return false;
        if (!TerminateProcess(process, 1) && WaitForSingleObject(process, 0) != 0) return false;
        return WaitForSingleObject(process, 2000) == 0;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct ProcessEntry32
    {
        internal int Size; internal uint Usage, Pid; internal nint HeapId; internal uint ModuleId, Threads, ParentPid;
        internal int Priority; internal uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] internal string File;
    }

    // Instantánea de todos los procesos del sistema (TH32CS_SNAPPROCESS = 2), con PID padre.
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern SafeFileHandle CreateToolhelp32Snapshot(uint flags, uint pid);
    // Recorre la instantánea; el nombre del archivo no se usa como identidad.
    [DllImport("kernel32.dll", EntryPoint = "Process32FirstW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool Process32First(SafeFileHandle snapshot, ref ProcessEntry32 entry);
    [DllImport("kernel32.dll", EntryPoint = "Process32NextW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool Process32Next(SafeFileHandle snapshot, ref ProcessEntry32 entry);
    // Derechos mínimos: consulta limitada; para cerrar, además terminar y esperar.
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern SafeProcessHandle OpenProcess(uint access, bool inherit, uint pid);
    // Hora de creación (FILETIME UTC): junto al PID identifica el proceso y lo sitúa en la sesión.
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetProcessTimes(SafeProcessHandle process, out long created, out long exited, out long kernel, out long user);
    // Sesión de Windows del proceso: el cliente nunca está en la sesión 0 de servicios.
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool ProcessIdToSessionId(uint pid, out uint session);
    // Solo TOKEN_QUERY (8): lee el usuario sin suplantarlo.
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool OpenProcessToken(SafeProcessHandle process, uint access, out SafeAccessTokenHandle token);
    // Ruta completa en formato Win32: distingue el host de Pope y WebView2 de copias con el mismo nombre.
    [DllImport("kernel32.dll", EntryPoint = "QueryFullProcessImageNameW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool QueryFullProcessImageName(SafeProcessHandle process, uint flags, StringBuilder text, ref int length);
    // Un proceso crítico no se termina nunca: Windows se detendría con pantalla azul.
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool IsProcessCritical(SafeProcessHandle process, out bool critical);
    // Cierre inmediato: desde la sesión 0 no se pueden enviar mensajes a ventanas del cliente.
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(SafeProcessHandle process, uint exitCode);
    // Confirma la salida real antes de contarlo como cerrado.
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(SafeProcessHandle process, uint milliseconds);
}
