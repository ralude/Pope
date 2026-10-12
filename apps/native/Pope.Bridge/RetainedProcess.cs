using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;

namespace Pope.Bridge;

// REQ-003-63: el objeto de kernel retenido sobrevive a la salida y no se confunde con un PID nuevo.
internal sealed class RetainedProcess : IDisposable
{
    private readonly SafeProcessHandle handle;
    internal uint Id { get; }
    internal uint Session { get; }
    internal string UserSid { get; }
    internal string LogonSid { get; }
    internal bool Alive => WaitForSingleObject(handle, 0) == 258;

    internal RetainedProcess(Process process) : this(Duplicate(process)) { }

    private static SafeProcessHandle Duplicate(Process process)
    {
        if (!DuplicateHandle(GetCurrentProcess(), process.SafeHandle, GetCurrentProcess(), out var duplicate, 0, false, 2)) throw new Win32Exception();
        return duplicate;
    }

    private RetainedProcess(SafeProcessHandle retained)
    {
        handle = retained;
        try
        {
            Id = GetProcessId(handle);
            if (Id == 0 || !Alive || !ProcessIdToSessionId(Id, out var session)) throw new UnauthorizedAccessException();
            Session = session;
            if (!OpenProcessToken(handle, 8, out var token)) throw new Win32Exception();
            using (token)
            using (var identity = new WindowsIdentity(token.DangerousGetHandle()))
            {
                UserSid = identity.User!.Value;
                LogonSid = ReadLogonSid(token)
                    ?? (identity.IsSystem ? UserSid : throw new UnauthorizedAccessException());
            }
            if (!Alive) throw new UnauthorizedAccessException();
        }
        catch { handle.Dispose(); throw; }
    }

    internal bool Matches(uint pid) => Alive && pid == Id && ProcessIdToSessionId(pid, out var session) && session == Session && Alive;
    internal static RetainedProcess ForService(int pid)
    {
        // El host sin elevación no pide PROCESS_ALL_ACCESS sobre el servicio.
        var handle = OpenProcess(0x00101000, false, checked((uint)pid));
        if (handle.IsInvalid) { handle.Dispose(); throw new UnauthorizedAccessException("Servidor del puente no válido."); }
        var retained = new RetainedProcess(handle);
        if (retained.UserSid == "S-1-5-18" && retained.Session == 0) return retained;
        retained.Dispose(); throw new UnauthorizedAccessException("Servidor del puente no válido.");
    }
    public void Dispose() => handle.Dispose();

    private static string? ReadLogonSid(SafeAccessTokenHandle token)
    {
        GetTokenInformation(token, 2, 0, 0, out var size);
        if (size is < 8 or > 65_536) throw new UnauthorizedAccessException();
        var buffer = Marshal.AllocHGlobal(size);
        try
        {
            if (!GetTokenInformation(token, 2, buffer, size, out _)) throw new Win32Exception();
            var count = Marshal.ReadInt32(buffer);
            var offset = Marshal.OffsetOf<TokenGroups>(nameof(TokenGroups.First)).ToInt32();
            var stride = Marshal.SizeOf<SidAttributes>();
            if (count < 0 || count > (size - offset) / stride) throw new UnauthorizedAccessException();
            for (var index = 0; index < count; index++)
            {
                var group = Marshal.PtrToStructure<SidAttributes>(buffer + offset + index * stride);
                if ((group.Attributes & 0xc0000000) == 0xc0000000) return new SecurityIdentifier(group.Sid).Value;
            }
            return null;
        }
        finally { Marshal.FreeHGlobal(buffer); }
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct SidAttributes { internal nint Sid; internal uint Attributes; }
    [StructLayout(LayoutKind.Sequential)]
    private struct TokenGroups { internal uint Count; internal SidAttributes First; }

    // Duplica el handle existente sin herencia; conserva el mismo objeto de proceso y sus derechos.
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool DuplicateHandle(nint source, SafeProcessHandle process, nint destination, out SafeProcessHandle duplicate, uint access, bool inherit, uint options);
    // Pseudohandle del propio proceso; no debe cerrarse.
    [DllImport("kernel32.dll")]
    private static extern nint GetCurrentProcess();
    // Obtiene el PID del objeto retenido, no de una ruta ni un mensaje del cliente.
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint GetProcessId(SafeProcessHandle process);
    // Consulta señal de salida sin esperar: un proceso terminado nunca se acepta aunque su PID se reutilice.
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(SafeProcessHandle process, uint milliseconds);
    // Contrasta la sesión efectiva del PID conectado con la sesión del proceso retenido.
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool ProcessIdToSessionId(uint pid, out uint session);
    // Solo TOKEN_QUERY: lee SID/logon sin impersonar ni modificar privilegios.
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool OpenProcessToken(SafeProcessHandle process, uint access, out SafeAccessTokenHandle token);
    // Lee TOKEN_GROUPS completo: WindowsIdentity.Groups omite el SID especial de logon.
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool GetTokenInformation(SafeAccessTokenHandle token, int kind, nint information, int size, out int needed);
    // Solo QUERY_LIMITED_INFORMATION y SYNCHRONIZE para el proceso del servidor; nunca controlarlo.
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern SafeProcessHandle OpenProcess(uint access, bool inherit, uint pid);
}
