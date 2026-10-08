using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace Pope.DesktopProbe;

// Handles retenidos: garantiza pertenencia al job antes de ejecutar una sola instrucción.
internal sealed class ProbeLaunch : IDisposable
{
    private nint job;
    private readonly List<Process> children = [];
    internal ProbeLaunch()
    {
        job = CreateJob(0, null);
        if (job == 0) throw new Win32Exception();
        var limits = new JobLimits();
        limits.Basic.Flags = 0x2000; // KILL_ON_JOB_CLOSE; sin BREAKAWAY_OK.
        if (!SetJobInformation(job, 9, ref limits, Marshal.SizeOf<JobLimits>()))
        { CloseHandle(job); job = 0; throw new Win32Exception(); }
    }

    internal Process Start(ProbeToken token, string executable, string desktop, nint environment, params string[] arguments)
    {
        if (executable.Contains('"') || arguments.Any(arg => arg.Contains('"') || arg.EndsWith('\\')))
            throw new ArgumentException("Argumentos internos no admitidos");
        var command = new StringBuilder(string.Join(" ", new[] { executable }.Concat(arguments).Select(value => $"\"{value}\"")));
        var startup = new Startup { Size = Marshal.SizeOf<Startup>(), Desktop = "winsta0\\" + desktop };
        // Solo WebView2 requiere un handle de su escritorio en esta misma sesión (T09).
        // Los tokens/job/perfil no son heredables; entre sesiones siempre false.
        var inheritedDesktop = arguments is ["--window", "use" or "lock", _]
            ? DesktopNative.OpenDesktop(desktop, 0, true, DesktopNative.DesktopAccess) : 0;
        ProcessInfo info;
        try
        {
            if (!CreateProcessAsUser(token.Handle, executable, command, 0, 0, inheritedDesktop != 0, 0x08000404, environment,
                Path.GetDirectoryName(executable), ref startup, out info)) throw new Win32Exception();
        }
        finally { if (inheritedDesktop != 0) DesktopNative.CloseDesktop(inheritedDesktop); }
        try
        {
            if (!AssignProcess(job, info.Process)) throw new Win32Exception();
            if (ResumeThread(info.Thread) == uint.MaxValue) throw new Win32Exception();
            var process = Process.GetProcessById((int)info.Pid);
            children.Add(process);
            return process;
        }
        catch { TerminateProcess(info.Process, 1); throw; }
        finally { CloseHandle(info.Thread); CloseHandle(info.Process); }
    }

    internal bool Contains(Process process) => IsProcessInJob(process.Handle, job, out var assigned) && assigned;
    public void Dispose()
    {
        if (job != 0) { CloseHandle(job); job = 0; }
        foreach (var process in children)
        {
            if (!process.WaitForExit(5000)) throw new TimeoutException("Un proceso del job no terminó");
            process.Dispose();
        }
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct Startup
    {
        internal int Size; internal string? Reserved, Desktop, Title;
        internal int X, Y, Width, Height, XChars, YChars, Fill, Flags;
        internal short Show, ReservedSize; internal nint ReservedPointer, Input, Output, Error;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInfo { internal nint Process, Thread; internal uint Pid, Tid; }
    [StructLayout(LayoutKind.Sequential)]
    private struct BasicLimits
    {
        internal long ProcessTime, JobTime; internal uint Flags;
        internal nuint MinWorking, MaxWorking; internal uint ActiveProcesses; internal nuint Affinity; internal uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct Counters { internal ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes; }
    [StructLayout(LayoutKind.Sequential)]
    private struct JobLimits { internal BasicLimits Basic; internal Counters Io; internal nuint ProcessMemory, JobMemory, PeakProcess, PeakJob; }
    // Crea un job anónimo no heredable, exclusivo de esta ejecución del ensayo.
    [DllImport("kernel32.dll", EntryPoint = "CreateJobObjectW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern nint CreateJob(nint attributes, string? name);
    // El último cierre mata solo sus miembros; no permite escapar por breakaway.
    [DllImport("kernel32.dll", EntryPoint = "SetInformationJobObject", SetLastError = true)]
    private static extern bool SetJobInformation(nint job, int kind, ref JobLimits information, int length);
    // Asigna el proceso suspendido antes de que pueda crear hijos ajenos al job.
    [DllImport("kernel32.dll", EntryPoint = "AssignProcessToJobObject", SetLastError = true)]
    private static extern bool AssignProcess(nint job, nint process);
    // Comprueba pertenencia real; el PID o el nombre por sí solos no la demuestran.
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool IsProcessInJob(nint process, nint job, out bool assigned);
    // Nace bajo el token primario indicado y en el escritorio elegido, suspendido.
    [DllImport("advapi32.dll", EntryPoint = "CreateProcessAsUserW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcessAsUser(nint token, string app, StringBuilder command, nint processAttributes,
        nint threadAttributes, bool inherit, uint flags, nint environment, string? directory, ref Startup startup, out ProcessInfo process);
    // Solo reanuda tras incorporar el proceso al job.
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(nint thread);
    // Deshace únicamente el proceso propio suspendido si no se pudo asignar al job.
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(nint process, uint exit);
    // Cierra handles propios; el job no se entrega a los hijos.
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(nint handle);
}
