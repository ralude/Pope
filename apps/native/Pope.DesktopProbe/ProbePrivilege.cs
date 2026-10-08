using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;

namespace Pope.DesktopProbe;

internal static class ProbePrivilege
{
    internal static void Enable(string name)
    {
        using var identity = WindowsIdentity.GetCurrent(TokenAccessLevels.Query | TokenAccessLevels.AdjustPrivileges);
        if (!LookupPrivilegeValue(null, name, out var luid)) throw new Win32Exception();
        var privileges = new Privileges { Count = 1, Luid = luid, Attributes = 2 };
        if (!AdjustTokenPrivileges(identity.Token, false, ref privileges, 0, 0, 0)) throw new Win32Exception();
        var error = Marshal.GetLastWin32Error();
        if (error != 0) throw new Win32Exception(error);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Luid { internal uint Low; internal int High; }
    [StructLayout(LayoutKind.Sequential)]
    private struct Privileges { internal uint Count; internal Luid Luid; internal uint Attributes; }
    // Resuelve el privilegio que Windows ya concedió al proceso; no modifica cuentas.
    [DllImport("advapi32.dll", EntryPoint = "LookupPrivilegeValueW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool LookupPrivilegeValue(string? system, string name, out Luid luid);
    // Activa solo un privilegio existente en este token para las operaciones del ensayo.
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool AdjustTokenPrivileges(nint token, bool disable, ref Privileges state, uint length, nint previous, nint needed);
}
