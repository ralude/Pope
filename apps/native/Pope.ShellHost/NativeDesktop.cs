using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Text;
using Microsoft.Win32.SafeHandles;
using Pope.Bridge;

namespace Pope.ShellHost;

// REQ-003-33: handles no heredables, acceso por logon y ningún cambio de directivas.
internal sealed class NativeDesktop : SafeHandleZeroOrMinusOneIsInvalid
{
    internal string Name { get; }
    private NativeDesktop(nint value, string name) : base(true) { SetHandle(value); Name = name; }
    internal static NativeDesktop Create(string name)
    {
        if (!name.StartsWith("PopeLock", StringComparison.Ordinal) || name.Length > 80 || name.Any(c => !char.IsAsciiLetterOrDigit(c)))
            throw new ArgumentException("Nombre de escritorio no válido.");
        using var process = Process.GetCurrentProcess();
        using var identity = new RetainedProcess(process);
        var descriptor = new RawSecurityDescriptor($"D:P(A;;0xF01FF;;;SY)(A;;0xF01FF;;;{identity.LogonSid})");
        var bytes = new byte[descriptor.BinaryLength]; descriptor.GetBinaryForm(bytes, 0);
        var pinned = GCHandle.Alloc(bytes, GCHandleType.Pinned);
        try
        {
            var attributes = new Attributes { Size = Marshal.SizeOf<Attributes>(), Descriptor = pinned.AddrOfPinnedObject() };
            var value = CreateDesktop(name, null, 0, 0, 0xF01FF, ref attributes);
            if (value == 0) throw new Win32Exception();
            return new NativeDesktop(value, name);
        }
        finally { pinned.Free(); }
    }
    internal static NativeDesktop Current()
    {
        var value = GetThreadDesktop(GetCurrentThreadId());
        var text = new StringBuilder(256);
        if (value == 0 || !GetUserObjectInformation(value, 2, text, 512, out _)) throw new Win32Exception();
        var owned = OpenDesktop(text.ToString(), 0, false, 0x101);
        if (owned == 0) throw new Win32Exception();
        return new NativeDesktop(owned, text.ToString());
    }
    internal void AttachFreshThread()
    {
        ObjectDisposedException.ThrowIf(IsClosed, this);
        if (!SetThreadDesktop(this)) throw new Win32Exception();
    }
    internal void Activate()
    {
        ObjectDisposedException.ThrowIf(IsClosed, this);
        if (!SwitchDesktop(this)) throw new Win32Exception();
    }
    internal Process Start(string executable, params string[] arguments)
    {
        ObjectDisposedException.ThrowIf(IsClosed, this);
        if (!Path.IsPathFullyQualified(executable) || !File.Exists(executable)) throw new ArgumentException("Ejecutable local no válido.");
        var command = new StringBuilder(string.Join(" ", new[] { executable }.Concat(arguments).Select(Quote)));
        var startup = new StartupInfo { Size = Marshal.SizeOf<StartupInfo>(), Desktop = "winsta0\\" + Name };
        var inherited = OpenDesktop(Name, 0, true, 0xF01FF);
        if (inherited == 0) throw new Win32Exception();
        try
        {
            if (!CreateProcess(executable, command, 0, 0, true, 0x08000000, 0, null, ref startup, out var created)) throw new Win32Exception();
            try
            {
                var launched = Process.GetProcessById(checked((int)created.Id));
                try { _ = launched.SafeHandle; return launched; }
                catch { launched.Dispose(); throw; }
            }
            finally { CloseHandle(created.Process); CloseHandle(created.Thread); }
        }
        finally { CloseDesktop(inherited); }
    }
    private static string Quote(string value)
    {
        if (value.Contains('"') || value.EndsWith('\\')) throw new ArgumentException("Argumento interno no válido.");
        return "\"" + value + "\"";
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct StartupInfo
    {
        internal int Size; internal string? Reserved, Desktop, Title;
        internal int X, Y, Width, Height, XChars, YChars, Fill, Flags;
        internal short Show, ReservedSize; internal nint ReservedPointer, Input, Output, Error;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInfo { internal nint Process, Thread; internal uint Id, ThreadId; }
    protected override bool ReleaseHandle() => CloseDesktop(handle);
    [StructLayout(LayoutKind.Sequential)]
    private struct Attributes { internal int Size; internal nint Descriptor; internal int Inherit; }
    // Crea bloqueo sin herencia de ACE amplias; solo SYSTEM y el logon interactivo actual.
    [DllImport("user32.dll", EntryPoint = "CreateDesktopW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern nint CreateDesktop(string name, string? device, nint mode, uint flags, uint access, ref Attributes attributes);
    // Reabre el escritorio del hilo con un handle propio, sin cerrar el prestado por Windows.
    [DllImport("user32.dll", EntryPoint = "OpenDesktopW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern nint OpenDesktop(string name, uint flags, bool inherit, uint access);
    // Nombre Win32 del escritorio actual; no se aceptan rutas proporcionadas por JavaScript.
    [DllImport("user32.dll", EntryPoint = "GetUserObjectInformationW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool GetUserObjectInformation(nint handle, int kind, StringBuilder text, int bytes, out int needed);
    // Consulta el escritorio del hilo antes de crear ventanas o instalar hooks.
    [DllImport("user32.dll")]
    private static extern nint GetThreadDesktop(uint thread);
    // ID Win32; ManagedThreadId no identifica al hilo para USER32.
    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();
    // Solo para un hilo STA nuevo: las ventanas WebView2 nunca se trasladan entre escritorios.
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetThreadDesktop(NativeDesktop desktop);
    // Cambia entrada/visibilidad, sin suspender ni terminar procesos del escritorio inactivo.
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SwitchDesktop(NativeDesktop desktop);
    // Libera el handle una vez terminados los hilos que lo utilizan.
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool CloseDesktop(nint handle);
    // Nacimiento en el escritorio fijo: WebView2 hereda el escritorio temporal abierto para ese hijo.
    [DllImport("kernel32.dll", EntryPoint = "CreateProcessW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcess(string application, StringBuilder command, nint processAttributes, nint threadAttributes, bool inherit, uint flags, nint environment, string? directory, ref StartupInfo startup, out ProcessInfo process);
    // Libera los handles iniciales; Process retiene su propio handle del proceso creado.
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(nint handle);
}
