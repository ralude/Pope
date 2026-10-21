using System.Runtime.InteropServices;

namespace Pope.Agent;

// T31 · REQ-003-20: solo dos variantes cerradas, reiniciar o apagar el equipo local. Sin
// ejecutables, rutas ni argumentos: el nodo elige el tipo y nada más.
internal static class WindowsPower
{
    private const uint ShutdownForceOthers = 0x1;   // SHUTDOWN_FORCE_OTHERS: cierra las apps de otras sesiones sin preguntar.
    private const uint ShutdownForceSelf = 0x2;     // SHUTDOWN_FORCE_SELF: cierra también las de la sesión que llama.
    private const uint ShutdownRestart = 0x4;       // SHUTDOWN_RESTART
    private const uint ShutdownPowerOff = 0x8;      // SHUTDOWN_POWEROFF: apagado completo, sin el arranque rápido híbrido.
    // SHTDN_REASON_MAJOR_APPLICATION | SHTDN_REASON_MINOR_MAINTENANCE | SHTDN_REASON_FLAG_PLANNED: queda en el registro de eventos.
    private const uint Reason = 0x00040000 | 0x00000001 | 0x80000000;
    private const uint TokenAdjustPrivileges = 0x20, TokenQuery = 0x8, PrivilegeEnabled = 0x2;
    internal const int ErrorNotAllAssigned = 1300;

    // Pide el reinicio o apagado y devuelve el código de Windows (0 si lo aceptó). Aceptar no
    // demuestra que el equipo se apague: eso solo se ve cuando la PC deja de responder o vuelve.
    // `graceSeconds` es 0 en producto; el ensayo usa un margen para poder anularlo.
    internal static int Initiate(string kind, uint graceSeconds = 0)
    {
        var action = kind switch
        {
            "restart" => ShutdownRestart,
            "powerOff" => ShutdownPowerOff,
            _ => throw new ArgumentOutOfRangeException(nameof(kind))
        };
        var privilege = EnableShutdownPrivilege();
        if (privilege != 0) return privilege;
        // InitiateShutdownW: Windows inicia el reinicio o apagado del equipo local (lpMachineName nulo).
        return (int)InitiateShutdownW(null, null, graceSeconds, action | ShutdownForceOthers | ShutdownForceSelf, Reason);
    }

    // Windows exige que SeShutdownPrivilege esté activo en el token del proceso, aunque la cuenta
    // lo tenga (LocalSystem lo tiene, desactivado). Devuelve 0 o el código de error.
    internal static int EnableShutdownPrivilege()
    {
        // OpenProcessToken: abre el token del propio proceso para cambiar sus privilegios.
        if (!OpenProcessToken(GetCurrentProcess(), TokenAdjustPrivileges | TokenQuery, out var token)) return Marshal.GetLastPInvokeError();
        try
        {
            // LookupPrivilegeValueW: traduce el nombre del privilegio a su identificador local.
            if (!LookupPrivilegeValueW(null, "SeShutdownPrivilege", out var luid)) return Marshal.GetLastPInvokeError();
            var privileges = new TokenPrivileges { Count = 1, Luid = luid, Attributes = PrivilegeEnabled };
            // AdjustTokenPrivileges: activa el privilegio; si la cuenta no lo tiene devuelve
            // éxito pero deja ERROR_NOT_ALL_ASSIGNED, que hay que comprobar aparte.
            if (!AdjustTokenPrivileges(token, false, ref privileges, 0, IntPtr.Zero, IntPtr.Zero)) return Marshal.GetLastPInvokeError();
            return Marshal.GetLastPInvokeError() == ErrorNotAllAssigned ? ErrorNotAllAssigned : 0;
        }
        finally { CloseHandle(token); }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Luid { public uint Low; public int High; }
    // TOKEN_PRIVILEGES con un solo privilegio: el LUID son dos campos de 4 bytes, sin relleno.
    [StructLayout(LayoutKind.Sequential)]
    private struct TokenPrivileges { public uint Count; public Luid Luid; public uint Attributes; }

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint InitiateShutdownW(string? machine, string? message, uint gracePeriod, uint flags, uint reason);
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool LookupPrivilegeValueW(string? system, string name, out Luid luid);
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool AdjustTokenPrivileges(IntPtr token, bool disableAll, ref TokenPrivileges state, uint length, IntPtr previous, IntPtr returnLength);
    [DllImport("kernel32.dll")]
    private static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);
}
