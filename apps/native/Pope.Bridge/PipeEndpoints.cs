using System.ComponentModel;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;

namespace Pope.Bridge;

internal static class PipeEndpoints
{
    internal const uint HostAccess = 0x0012019b; // Lectura/escritura sin FILE_CREATE_PIPE_INSTANCE (0x4).
    internal static string NewName() => "Pope.Shell." + Guid.NewGuid().ToString("N");
    internal static void ValidateName(string name)
    {
        if (!name.StartsWith("Pope.Shell.", StringComparison.Ordinal) || !Guid.TryParseExact(name[11..], "N", out _) || name.Length != 43)
            throw new InvalidDataException("Nombre de puente no válido.");
    }

    internal static NamedPipeServerStream Create(string name, RetainedProcess host)
    {
        ValidateName(name);
        if (!host.Alive || host.Session == 0) throw new UnauthorizedAccessException("Host no válido.");
        using var identity = WindowsIdentity.GetCurrent();
        var owner = identity.User!.Value;
        var descriptor = $"O:{owner}D:P(A;;FA;;;SY)";
        if (owner != "S-1-5-18") descriptor += $"(A;;FA;;;{owner})";
        descriptor += $"(A;;0x{HostAccess:x};;;{host.LogonSid})";
        if (!ConvertDescriptor(descriptor, 1, out var security, out _)) throw new Win32Exception();
        try
        {
            var attributes = new SecurityAttributes { Length = Marshal.SizeOf<SecurityAttributes>(), Descriptor = security };
            // Duplex/overlapped/primera instancia y PIPE_REJECT_REMOTE_CLIENTS; un único cliente.
            var handle = CreateNamedPipe(@"\\.\pipe\" + name, 0x40080003, 8, 1, 16_384, 16_384, 5000, ref attributes);
            if (handle.IsInvalid) { handle.Dispose(); throw new Win32Exception(); }
            try { return new NamedPipeServerStream(PipeDirection.InOut, true, false, handle); }
            catch { handle.Dispose(); throw; }
        }
        finally { LocalFree(security); }
    }

    internal static bool IsHost(NamedPipeServerStream pipe, RetainedProcess expected) =>
        GetClientPid(pipe.SafePipeHandle, out var pid) && expected.Matches(pid);
    internal static bool IsServer(NamedPipeClientStream pipe, RetainedProcess expected) =>
        GetServerPid(pipe.SafePipeHandle, out var pid) && expected.Matches(pid);

    internal static async Task<NamedPipeClientStream> Connect(string name, RetainedProcess server, CancellationToken token)
    {
        ValidateName(name);
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
        deadline.CancelAfter(TimeSpan.FromSeconds(5));
        while (true)
        {
            deadline.Token.ThrowIfCancellationRequested();
            if (!server.Alive) throw new UnauthorizedAccessException("Servidor del puente no válido.");
            // Derechos concretos: GENERIC_WRITE también concedería creación de otra instancia.
            var handle = CreateFile(@"\\.\pipe\" + name, HostAccess, 0, 0, 3, 0x40000000, 0);
            if (!handle.IsInvalid)
            {
                NamedPipeClientStream? pipe = null;
                try
                {
                    pipe = new NamedPipeClientStream(PipeDirection.InOut, true, true, handle);
                    if (!IsServer(pipe, server)) throw new UnauthorizedAccessException("Servidor del puente no válido.");
                    return pipe;
                }
                catch { if (pipe != null) pipe.Dispose(); else handle.Dispose(); throw; }
            }
            var error = Marshal.GetLastWin32Error(); handle.Dispose();
            if (error is not (2 or 231)) throw new UnauthorizedAccessException("No se pudo conectar al puente.");
            await Task.Delay(50, deadline.Token);
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SecurityAttributes { internal int Length; internal nint Descriptor; internal int Inherit; }
    // DACL explícita por logon del host; nunca usar los permisos predeterminados Everyone/Anonymous.
    [DllImport("advapi32.dll", EntryPoint = "ConvertStringSecurityDescriptorToSecurityDescriptorW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool ConvertDescriptor(string text, uint revision, out nint descriptor, out uint size);
    // Rechaza clientes de red en el kernel, antes de cualquier lectura de protocolo.
    [DllImport("kernel32.dll", EntryPoint = "CreateNamedPipeW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafePipeHandle CreateNamedPipe(string name, uint access, uint mode, uint instances, uint output, uint input, uint timeout, ref SecurityAttributes attributes);
    // Apertura solo local, asíncrona y sin herencia ni permiso de crear instancias.
    [DllImport("kernel32.dll", EntryPoint = "CreateFileW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafePipeHandle CreateFile(string name, uint access, uint share, nint attributes, uint creation, uint flags, nint template);
    // PID provisto por Windows; no aceptar el PID declarado en JSON por el cliente.
    [DllImport("kernel32.dll", EntryPoint = "GetNamedPipeClientProcessId", SetLastError = true)]
    private static extern bool GetClientPid(SafePipeHandle pipe, out uint pid);
    // El host contrasta también quién creó el servidor del pipe para impedir suplantación.
    [DllImport("kernel32.dll", EntryPoint = "GetNamedPipeServerProcessId", SetLastError = true)]
    private static extern bool GetServerPid(SafePipeHandle pipe, out uint pid);
    // Libera el descriptor asignado por la conversión SDDL.
    [DllImport("kernel32.dll")]
    private static extern nint LocalFree(nint memory);
}
