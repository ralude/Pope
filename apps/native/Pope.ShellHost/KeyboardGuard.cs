using System.ComponentModel;
using System.Runtime.InteropServices;

namespace Pope.ShellHost;

// REQ-003-30 / ADR-0023: el filtro no sustituye al aislamiento del escritorio.
internal sealed class KeyboardGuard(Func<(bool Blocked, bool HasSession)> state) : IDisposable
{
    private readonly HookCallback callback = null!;
    private nint hook;

    internal KeyboardGuard(Func<(bool Blocked, bool HasSession)> state, bool install) : this(state)
    {
        callback = Filter;
        if (install)
        {
            hook = SetWindowsHookEx(13, callback, GetModuleHandle(null), 0);
            if (hook == 0) throw new Win32Exception();
        }
    }

    internal static bool Suppress(int key, bool alt, bool control, bool blocked, bool hasSession, bool popeFocused) =>
        (key == 0x09 && alt && !hasSession) ||
        ((blocked || popeFocused) && (key is 0x5b or 0x5c || (key == 0x1b && control) || (key == 0x73 && alt)));

    private nint Filter(int code, nint message, nint data)
    {
        if (code >= 0 && message is 0x100 or 0x101 or 0x104 or 0x105)
        {
            var input = Marshal.PtrToStructure<KeyData>(data);
            var current = state();
            GetWindowThreadProcessId(GetForegroundWindow(), out var pid);
            if (Suppress((int)input.Key, (input.Flags & 0x20) != 0, (GetAsyncKeyState(0x11) & 0x8000) != 0,
                current.Blocked, current.HasSession, pid == Environment.ProcessId)) return 1;
        }
        return CallNextHookEx(hook, code, message, data);
    }
    public void Dispose()
    {
        if (hook == 0) return;
        if (!UnhookWindowsHookEx(hook)) throw new Win32Exception();
        hook = 0;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct KeyData { internal uint Key, Scan, Flags, Time; internal nuint Extra; }
    private delegate nint HookCallback(int code, nint message, nint data);
    // Hook de teclado del escritorio del hilo; requiere su bucle de mensajes, nunca intercepta SAS.
    [DllImport("user32.dll", EntryPoint = "SetWindowsHookExW", SetLastError = true)]
    private static extern nint SetWindowsHookEx(int type, HookCallback callback, nint module, uint thread);
    // Retira exactamente el hook propio al terminar el hilo/ventana.
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnhookWindowsHookEx(nint hook);
    // Conserva la cadena de entrada para cualquier tecla no restringida.
    [DllImport("user32.dll")]
    private static extern nint CallNextHookEx(nint hook, int code, nint message, nint data);
    // Módulo del ejecutable donde vive el callback retenido durante toda la vida del hook.
    [DllImport("kernel32.dll", EntryPoint = "GetModuleHandleW", CharSet = CharSet.Unicode)]
    private static extern nint GetModuleHandle(string? name);
    // Consulta Ctrl sin introducir cambios en el estado de teclado.
    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int key);
    // El foco se comprueba contra la ventana de Pope, no contra un título imitable.
    [DllImport("user32.dll")]
    private static extern nint GetForegroundWindow();
    // Atribuye la ventana activa a su proceso real, incluidas sus ventanas hijas.
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(nint window, out uint pid);
}
