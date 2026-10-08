using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;

namespace Pope.DesktopProbe;

internal static class DesktopNative
{
    internal const uint DesktopAccess = 0x000F01FF;

    internal static nint Create(string name)
    {
        using var identity = WindowsIdentity.GetCurrent();
        var descriptor = new RawSecurityDescriptor($"D:P(A;;0x{DesktopAccess:X};;;SY)(A;;0x{DesktopAccess:X};;;{identity.User!.Value})");
        var bytes = new byte[descriptor.BinaryLength];
        descriptor.GetBinaryForm(bytes, 0);
        var pointer = Marshal.AllocHGlobal(bytes.Length);
        try
        {
            Marshal.Copy(bytes, 0, pointer, bytes.Length);
            var attributes = new SecurityAttributes { Length = Marshal.SizeOf<SecurityAttributes>(), Descriptor = pointer };
            var desktop = CreateDesktop(name, null, 0, 0, DesktopAccess, ref attributes);
            if (desktop == 0) throw new Win32Exception();
            return desktop;
        }
        finally { Marshal.FreeHGlobal(pointer); }
    }

    internal static Process Start(string desktop, params string[] arguments) => StartExternal(desktop, Environment.ProcessPath!, arguments);

    internal static Process StartExternal(string desktop, string executable, params string[] arguments)
    {
        var command = new StringBuilder(string.Join(" ", new[] { executable }.Concat(arguments).Select(Quote)));
        var startup = new StartupInfo { Size = Marshal.SizeOf<StartupInfo>(), Desktop = $"winsta0\\{desktop}" };
        // WebView2 crea sus propios procesos: heredar un único escritorio permite que
        // sus hilos se conecten al mismo. Los handles persistentes no son heredables.
        var inheritedDesktop = OpenDesktop(desktop, 0, true, DesktopAccess);
        if (inheritedDesktop == 0) throw new Win32Exception();
        try
        {
            if (!CreateProcess(executable, command, 0, 0, true, 0x08000000, 0, null, ref startup, out var process)) throw new Win32Exception();
            try { return Process.GetProcessById((int)process.ProcessId); }
            finally { CloseHandle(process.Process); CloseHandle(process.Thread); }
        }
        finally { CloseDesktop(inheritedDesktop); }
    }

    private static string Quote(string value)
    {
        // Solo nombres/rutas internos del prototipo; no acepta argumentos con comillas.
        if (value.Contains('"') || value.EndsWith('\\')) throw new ArgumentException("Argumento del prototipo no admitido");
        return $"\"{value}\"";
    }

    internal static string Name(nint desktop)
    {
        var buffer = new StringBuilder(256);
        if (!GetUserObjectInformation(desktop, 2, buffer, buffer.Capacity * 2, out _)) throw new Win32Exception();
        return buffer.ToString();
    }

    internal static bool Elevated()
    {
        using var identity = WindowsIdentity.GetCurrent();
        if (!GetTokenInformation(identity.Token, 20, out var value, sizeof(int), out _)) throw new Win32Exception();
        return value != 0;
    }

    internal static string Acl(nint desktop)
    {
        uint information = 4;
        GetUserObjectSecurity(desktop, ref information, null, 0, out var length);
        var bytes = new byte[length];
        if (!GetUserObjectSecurity(desktop, ref information, bytes, length, out _)) throw new Win32Exception();
        return new RawSecurityDescriptor(bytes, 0).GetSddlForm(AccessControlSections.Access);
    }

    internal static bool HasExplorer(nint desktop)
    {
        var found = false;
        if (!EnumDesktopWindows(desktop, (window, _) =>
        {
            GetWindowThreadProcessId(window, out var pid);
            using var process = Process.GetProcessById((int)pid);
            found |= process.ProcessName.Equals("explorer", StringComparison.OrdinalIgnoreCase);
            return true;
        }, 0)) throw new Win32Exception();
        return found;
    }

    internal static Size Resolution() => new(GetSystemMetrics(0), GetSystemMetrics(1));
    // Consulta el modo visible efectivo, para distinguir pantalla exclusiva de F11.
    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int index);

    private delegate bool WindowCallback(nint window, nint parameter);
    // Enumera ventanas del escritorio concreto para comprobar ausencia real de Explorer.
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool EnumDesktopWindows(nint desktop, WindowCallback callback, nint parameter);
    // Identifica al propietario de cada ventana sin depender de sus títulos.
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(nint window, out uint pid);

    [StructLayout(LayoutKind.Sequential)]
    private struct SecurityAttributes { internal int Length; internal nint Descriptor; internal int Inherit; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct StartupInfo
    {
        internal int Size; internal string? Reserved; internal string? Desktop; internal string? Title;
        internal int X, Y, Width, Height, XChars, YChars, Fill, Flags;
        internal short Show, ReservedSize; internal nint ReservedPointer, Input, Output, Error;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInformation { internal nint Process, Thread; internal uint ProcessId, ThreadId; }

    // Crea un escritorio temporal con DACL explícita, sin heredar permisos amplios.
    [DllImport("user32.dll", EntryPoint = "CreateDesktopW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern nint CreateDesktop(string name, string? device, nint mode, uint flags, uint access, ref SecurityAttributes attributes);
    // Obtiene el escritorio activo para garantizar la vuelta al original de la VM.
    [DllImport("user32.dll", SetLastError = true)]
    internal static extern nint OpenInputDesktop(uint flags, bool inherit, uint access);
    // Abre un escritorio ya existente; solo se usa para recuperación del prototipo.
    [DllImport("user32.dll", EntryPoint = "OpenDesktopW", CharSet = CharSet.Unicode, SetLastError = true)]
    internal static extern nint OpenDesktop(string name, uint flags, bool inherit, uint access);
    // Cambia la entrada/visibilidad al escritorio indicado; nunca mueve ventanas.
    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool SwitchDesktop(nint desktop);
    // Libera el handle de escritorio una vez que sus hilos/procesos han terminado.
    [DllImport("user32.dll", SetLastError = true)]
    internal static extern bool CloseDesktop(nint desktop);
    // Determina el escritorio del hilo para demostrar que WebView2 no se trasladó.
    [DllImport("user32.dll")]
    internal static extern nint GetThreadDesktop(uint thread);
    // Obtiene el ID nativo del hilo; el ID administrado no identifica hilos Win32.
    [DllImport("kernel32.dll")]
    internal static extern uint GetCurrentThreadId();
    // Lee el nombre del objeto escritorio para registrar evidencia de aislamiento.
    [DllImport("user32.dll", EntryPoint = "GetUserObjectInformationW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool GetUserObjectInformation(nint handle, int index, StringBuilder data, int length, out int needed);
    // Lee la DACL aplicada realmente, en lugar de dar por cierta la solicitada.
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetUserObjectSecurity(nint handle, ref uint information, byte[]? descriptor, uint length, out uint needed);
    // Comprueba elevación efectiva del token para impedir WebView2 elevado en la prueba.
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool GetTokenInformation(nint token, int information, out int elevation, int length, out int needed);
    // Asigna el escritorio desde el nacimiento del proceso, antes de WinForms/WebView2.
    [DllImport("kernel32.dll", EntryPoint = "CreateProcessW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcess(string application, StringBuilder command, nint processAttributes, nint threadAttributes, bool inherit, uint flags, nint environment, string? directory, ref StartupInfo startup, out ProcessInformation process);
    // Cierra los handles iniciales de proceso/hilo; Process administra su propio handle.
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(nint handle);
}
