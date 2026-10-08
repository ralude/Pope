using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text.Json;

namespace Pope.DesktopProbe;

internal sealed class ProbeToken(nint handle) : IDisposable
{
    internal nint Handle { get; } = handle;
    internal TokenState State => Inspect(Handle);
    public void Dispose() => CloseHandle(Handle);

    internal static ProbeToken Logon(ProbeCredential.CredentialBuffer credential, uint session)
    {
        var input = Marshal.PtrToStringUni(credential.User) ?? throw new InvalidDataException("Falta usuario Windows");
        var parts = input.Split('\\');
        var user = parts[^1];
        var domain = parts.Length == 2 ? parts[0] : ".";
        if (parts.Length > 2 || domain != "." && !domain.Equals(Environment.MachineName, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("El ensayo solo admite cuentas locales existentes");
        if (!LogonUser(user, domain, credential.Password, 2, 0, out var logged)) throw new Win32Exception();
        using var original = new ProbeToken(logged);
        return Elevated(original, session);
    }

    private static ProbeToken Elevated(ProbeToken original, uint session)
    {
        nint linked = 0;
        try
        {
            var source = original.Handle;
            if (!original.State.Elevated)
            {
                linked = Information(source, 19, Marshal.ReadIntPtr);
                source = linked;
            }
            var result = Duplicate(source, session);
            var state = result.State;
            if (!state.Elevated || state.Integrity < 12288 || state.User == "S-1-5-18" || state.Logon == null)
            {
                result.Dispose();
                throw new InvalidOperationException("Windows no concedió un token administrativo de usuario completo");
            }
            return result;
        }
        finally { if (linked != 0) CloseHandle(linked); }
    }

    internal static ProbeToken SystemInSession(uint session)
    {
        using var identity = WindowsIdentity.GetCurrent();
        if (!identity.IsSystem) throw new InvalidOperationException("Ayudante reservado al broker SYSTEM");
        return Duplicate(identity.Token, session);
    }

    internal static ProbeToken ConsoleUser(uint session)
    {
        if (!QueryUserToken(session, out var console)) throw new Win32Exception();
        using var original = new ProbeToken(console);
        nint linked = 0;
        try
        {
            var source = console;
            if (original.State.Elevated)
            {
                linked = Information(console, 19, Marshal.ReadIntPtr);
                source = linked;
            }
            var result = Duplicate(source, session);
            if (result.State.Elevated || result.State.Integrity > 8192 || result.State.User == "S-1-5-18")
            {
                result.Dispose(); throw new InvalidOperationException("El host cliente debe continuar limitado");
            }
            return result;
        }
        finally { if (linked != 0) CloseHandle(linked); }
    }

    private static ProbeToken Duplicate(nint token, uint session)
    {
        if (!DuplicateToken(token, 0x02000000, 0, 2, 1, out var primary)) throw new Win32Exception();
        var result = new ProbeToken(primary);
        try
        {
            if (!SetTokenInformation(primary, 12, ref session, sizeof(uint))) throw new Win32Exception();
            ProbeRun.Require(result.State.Session == session, "No se asignó la sesión requerida");
            return result;
        }
        catch { result.Dispose(); throw; }
    }

    internal static TokenState Inspect(nint token) => new(
        Information(token, 1, pointer => new SecurityIdentifier(Marshal.ReadIntPtr(pointer)).Value),
        Information(token, 2, pointer =>
        {
            var count = Marshal.ReadInt32(pointer);
            if (count is < 0 or > 2048) throw new InvalidDataException("Grupos de token fuera de límites");
            var offset = Marshal.OffsetOf<Group>(nameof(Group.Sid)).ToInt32();
            for (var index = 0; index < count; index++)
            {
                var entry = pointer + offset + index * Marshal.SizeOf<SidAttributes>();
                var group = Marshal.PtrToStructure<SidAttributes>(entry);
                if ((group.Attributes & 0xC0000000) == 0xC0000000) return new SecurityIdentifier(group.Sid).Value;
            }
            return null;
        }),
        Information(token, 20, pointer => Marshal.ReadInt32(pointer) != 0),
        Information(token, 18, Marshal.ReadInt32),
        Information(token, 25, pointer => int.Parse(new SecurityIdentifier(Marshal.ReadIntPtr(pointer)).Value.Split('-')[^1])),
        Information(token, 12, pointer => (uint)Marshal.ReadInt32(pointer)));

    private static T Information<T>(nint token, int kind, Func<nint, T> read)
    {
        GetTokenInformation(token, kind, 0, 0, out var size);
        if (size is < 1 or > 65536) throw new Win32Exception();
        var buffer = Marshal.AllocHGlobal(size);
        try
        {
            if (!GetTokenInformation(token, kind, buffer, size, out _)) throw new Win32Exception();
            return read(buffer);
        }
        finally { Marshal.FreeHGlobal(buffer); }
    }

    internal static int Check()
    {
        using var identity = WindowsIdentity.GetCurrent();
        var state = Inspect(identity.Token);
        ProbeRun.Require(state.User == identity.User!.Value, "SID incorrecto");
        ProbeRun.Require(state.Elevated == DesktopNative.Elevated(), "Elevación incoherente");
        Console.WriteLine(JsonSerializer.Serialize(state));
        return 0;
    }

    internal sealed record TokenState(string User, string? Logon, bool Elevated, int ElevationType, int Integrity, uint Session);
    [StructLayout(LayoutKind.Sequential)]
    private struct SidAttributes { internal nint Sid; internal uint Attributes; }
    [StructLayout(LayoutKind.Sequential)]
    private struct Group { internal uint Count; internal nint Sid; internal uint Attributes; }
    // Autentica contra Windows local, sin reutilizar la contraseña Pope ni registrarla.
    [DllImport("advapi32.dll", EntryPoint = "LogonUserW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool LogonUser(string user, string domain, nint password, uint type, uint provider, out nint token);
    // Consulta SID/logon, elevación, integridad y sesión efectivos del token.
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool GetTokenInformation(nint token, int kind, nint information, int length, out int needed);
    // Duplica como token primario no heredable, apto para CreateProcessAsUser.
    [DllImport("advapi32.dll", EntryPoint = "DuplicateTokenEx", SetLastError = true)]
    private static extern bool DuplicateToken(nint existing, uint access, nint attributes, int level, int type, out nint duplicate);
    // Asigna solo al duplicado la sesión interactiva; requiere privilegio SYSTEM.
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool SetTokenInformation(nint token, int kind, ref uint information, int size);
    // Obtiene la identidad real de consola; el broker debe tener SeTcbPrivilege.
    [DllImport("wtsapi32.dll", EntryPoint = "WTSQueryUserToken", SetLastError = true)]
    private static extern bool QueryUserToken(uint session, out nint token);
    // Descubre la consola actual; no presupone que Windows siempre use sesión 1.
    [DllImport("kernel32.dll", EntryPoint = "WTSGetActiveConsoleSessionId")]
    internal static extern uint ConsoleSession();
    // Libera tokens adquiridos; no cierra el token prestado de WindowsIdentity.
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(nint handle);
}
