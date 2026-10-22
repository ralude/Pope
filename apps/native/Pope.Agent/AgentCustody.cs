using Pope.Bridge;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;

namespace Pope.Agent;

// REQ-003-63 / ADR-0017: DPAPI no sustituye la DACL; ambas fronteras son obligatorias.
internal static class AgentCustody
{
    private const int MaximumBlob = 131_072;
    private const string Descriptor = "O:SYG:SYD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)";

    internal static void Store(string root, byte[] plain)
    {
        RequireAdministrator();
        using var configuration = AgentConfiguration.Parse(plain);
        StoreProtected(root, plain, "configuration.bin", create: true);
    }

    internal static void StoreRecovery(string root, byte[] plain)
    {
        RequireSystem();
        ValidateRecovery(plain);
        StoreProtected(root, plain, "recovery.bin", create: false);
    }

    // REQ-003-34: ámbito de la sesión del cliente; protegido para que el usuario no amplíe el cierre.
    internal static void StoreScope(string root, ClientScope? scope)
    {
        RequireSystem();
        if (scope is null)
        {
            var path = Path.Combine(Path.GetFullPath(root), "client-scope.bin");
            if (File.Exists(path)) { Verify(new FileInfo(path)); File.Delete(path); }
            return;
        }
        var plain = ClientSessionCleanup.Serialize(scope);
        try { StoreProtected(root, plain, "client-scope.bin", create: false); }
        finally { CryptographicOperations.ZeroMemory(plain); }
    }

    // T31: diario de reinicios y apagados, protegido como la recuperación.
    internal static void StorePowerJournal(string root, IReadOnlyList<PowerEntry> entries)
    {
        RequireSystem();
        var plain = PowerJournal.Serialize(entries);
        try { StoreProtected(root, plain, "power-journal.bin", create: false); }
        finally { CryptographicOperations.ZeroMemory(plain); }
    }

    internal static IReadOnlyList<PowerEntry> ReadPowerJournal(string root)
    {
        RequireSystem();
        Verify(new DirectoryInfo(Path.GetFullPath(root)));
        if (!File.Exists(Path.Combine(root, "power-journal.bin"))) return [];
        var plain = ReadProtected(root, "power-journal.bin");
        try { return PowerJournal.Parse(plain); }
        finally { CryptographicOperations.ZeroMemory(plain); }
    }

    // T40: salidas del mantenimiento pendientes de reconocer, protegidas como el diario de energía.
    internal static void StoreExitJournal(string root, IReadOnlyList<ExitEntry> entries)
    {
        RequireSystem();
        var plain = MaintenanceExitJournal.Serialize(entries);
        try { StoreProtected(root, plain, "maintenance-exit-journal.bin", create: false); }
        finally { CryptographicOperations.ZeroMemory(plain); }
    }

    internal static IReadOnlyList<ExitEntry> ReadExitJournal(string root)
    {
        RequireSystem();
        Verify(new DirectoryInfo(Path.GetFullPath(root)));
        if (!File.Exists(Path.Combine(root, "maintenance-exit-journal.bin"))) return [];
        var plain = ReadProtected(root, "maintenance-exit-journal.bin");
        try { return MaintenanceExitJournal.Parse(plain); }
        finally { CryptographicOperations.ZeroMemory(plain); }
    }

    internal static ClientScope? ReadScope(string root)
    {
        RequireSystem();
        Verify(new DirectoryInfo(Path.GetFullPath(root)));
        if (!File.Exists(Path.Combine(root, "client-scope.bin"))) return null;
        var plain = ReadProtected(root, "client-scope.bin");
        try { return ClientSessionCleanup.Parse(plain); }
        finally { CryptographicOperations.ZeroMemory(plain); }
    }

    private static void ValidateRecovery(byte[] bytes)
    {
        var hello = ProtocolValidation.Parse(bytes, "pc-to-node");
        if (hello.GetProperty("type").GetString() != "hello" ||
            hello.GetProperty("pendingMaintenanceExitId").ValueKind != System.Text.Json.JsonValueKind.Null ||
            (hello.TryGetProperty("localRemainingSeconds", out var seconds) && seconds.ValueKind != System.Text.Json.JsonValueKind.Null))
            throw new InvalidDataException("Recuperación no válida.");
    }

    private static void StoreProtected(string root, byte[] plain, string name, bool create)
    {
        using var privilege = new RestorePrivilege();
        var directory = new DirectoryInfo(Path.GetFullPath(root));
        RejectLinks(directory);
        if (!directory.Exists)
        {
            if (!create) throw new DirectoryNotFoundException();
            var security = new DirectorySecurity();
            security.SetSecurityDescriptorSddlForm(Descriptor);
            directory.Create(security);
        }
        Verify(directory);
        var lockPath = Path.Combine(directory.FullName, "custody.lock");
        var temporary = Path.Combine(directory.FullName, Guid.NewGuid().ToString("N") + ".tmp");
        if (File.Exists(lockPath)) Verify(new FileInfo(lockPath));
        using var guard = new FileStream(lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        ProtectFile(new FileInfo(lockPath));
        var encrypted = Transform(plain, protect: true);
        try
        {
            using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                ProtectFile(new FileInfo(temporary));
                file.Write(encrypted);
                file.Flush(flushToDisk: true);
            }
            var destination = Path.Combine(directory.FullName, name);
            if (File.Exists(destination)) Verify(new FileInfo(destination));
            File.Move(temporary, destination, overwrite: true);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(encrypted);
            if (File.Exists(temporary)) File.Delete(temporary);
        }
    }

    internal static AgentConfiguration Read(string root)
    {
        var plain = ReadProtected(root, "configuration.bin");
        try { return AgentConfiguration.Parse(plain); }
        finally { CryptographicOperations.ZeroMemory(plain); }
    }

    internal static byte[]? ReadRecovery(string root)
    {
        RequireSystem();
        Verify(new DirectoryInfo(Path.GetFullPath(root)));
        if (!File.Exists(Path.Combine(root, "recovery.bin"))) return null;
        var plain = ReadProtected(root, "recovery.bin");
        try { ValidateRecovery(plain); return plain; }
        catch { CryptographicOperations.ZeroMemory(plain); throw; }
    }

    private static byte[] ReadProtected(string root, string name)
    {
        RequireSystem();
        var directory = new DirectoryInfo(Path.GetFullPath(root));
        Verify(directory);
        var file = new FileInfo(Path.Combine(directory.FullName, name));
        Verify(file);
        using var stream = new FileStream(file.FullName, FileMode.Open, FileAccess.Read, FileShare.Read);
        if (stream.Length is < 1 or > MaximumBlob) throw new InvalidDataException("Configuración protegida fuera de límites.");
        var encrypted = new byte[(int)stream.Length];
        stream.ReadExactly(encrypted);
        try
        {
            return Transform(encrypted, protect: false);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(encrypted);
        }
    }

    internal static void Verify(FileSystemInfo item)
    {
        RejectLinks(item);
        FileSystemSecurity security = item is DirectoryInfo directory
            ? directory.GetAccessControl() : ((FileInfo)item).GetAccessControl();
        var rules = security.GetAccessRules(true, true, typeof(SecurityIdentifier)).Cast<FileSystemAccessRule>().ToArray();
        if (!security.AreAccessRulesProtected || security.GetOwner(typeof(SecurityIdentifier))?.Value != "S-1-5-18" ||
            rules.Length != 2 || rules.Select(r => r.IdentityReference.Value).Distinct().Count() != 2 ||
            rules.Any(r => r.IsInherited || r.AccessControlType != AccessControlType.Allow ||
                r.FileSystemRights != FileSystemRights.FullControl ||
                r.IdentityReference.Value is not ("S-1-5-18" or "S-1-5-32-544")))
            throw new UnauthorizedAccessException("Custodia del agente no válida.");
    }

    private static void RejectLinks(FileSystemInfo item)
    {
        for (FileSystemInfo? current = item; current != null; current = current is DirectoryInfo d ? d.Parent : ((FileInfo)current).Directory)
            if (current.Exists && (current.Attributes & FileAttributes.ReparsePoint) != 0)
                throw new UnauthorizedAccessException("Custodia del agente no válida.");
    }

    private static void ProtectFile(FileInfo file)
    {
        var security = new FileSecurity();
        security.SetSecurityDescriptorSddlForm("O:SYG:SYD:P(A;;FA;;;SY)(A;;FA;;;BA)");
        file.SetAccessControl(security);
    }

    private static void RequireAdministrator()
    {
        using var identity = WindowsIdentity.GetCurrent();
        if (!identity.IsSystem && !new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator))
            throw new UnauthorizedAccessException("La configuración exige administración local elevada.");
    }

    private static void RequireSystem()
    {
        using var identity = WindowsIdentity.GetCurrent();
        if (!identity.IsSystem) throw new UnauthorizedAccessException("La lectura exige el servicio LocalSystem.");
    }

    internal static byte[] Transform(byte[] input, bool protect)
    {
        if (input.Length is < 1 or > MaximumBlob) throw new InvalidDataException("Configuración protegida fuera de límites.");
        var pinned = GCHandle.Alloc(input, GCHandleType.Pinned);
        var data = new Blob { Size = input.Length, Data = pinned.AddrOfPinnedObject() };
        var output = new Blob();
        try
        {
            var ok = protect ? Protect(ref data, 0, 0, 0, 0, 5, out output) : Unprotect(ref data, 0, 0, 0, 0, 1, out output);
            if (!ok || output.Size is < 1 or > MaximumBlob) throw new InvalidDataException("Protección del agente no válida.");
            var result = new byte[output.Size];
            Marshal.Copy(output.Data, result, 0, result.Length);
            return result;
        }
        finally
        {
            if (output.Data != 0)
            {
                for (var index = 0; index < output.Size; index++) Marshal.WriteByte(output.Data, index, 0);
                LocalFree(output.Data);
            }
            pinned.Free();
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Blob { internal int Size; internal nint Data; }
    // DPAPI ligado a la máquina, sin interfaz; el acceso al blob lo restringe su DACL.
    [DllImport("crypt32.dll", EntryPoint = "CryptProtectData", SetLastError = true)]
    private static extern bool Protect(ref Blob input, nint description, nint entropy, nint reserved, nint prompt, uint flags, out Blob output);
    // El servicio descifra solo en memoria; nunca exporta el documento a host/React.
    [DllImport("crypt32.dll", EntryPoint = "CryptUnprotectData", SetLastError = true)]
    private static extern bool Unprotect(ref Blob input, nint description, nint entropy, nint reserved, nint prompt, uint flags, out Blob output);
    // Libera el buffer nativo de DPAPI tras borrarlo byte a byte.
    [DllImport("kernel32.dll")]
    private static extern nint LocalFree(nint memory);

    private sealed class RestorePrivilege : IDisposable
    {
        private readonly WindowsIdentity identity = WindowsIdentity.GetCurrent(TokenAccessLevels.Query | TokenAccessLevels.AdjustPrivileges);
        private Privileges previous;
        internal RestorePrivilege()
        {
            try
            {
                if (!LookupPrivilegeValue(null, "SeRestorePrivilege", out var luid)) throw new Win32Exception();
                var state = new Privileges { Count = 1, Luid = luid, Attributes = 2 };
                if (!AdjustTokenPrivileges(identity.Token, false, ref state, (uint)Marshal.SizeOf<Privileges>(), out previous, out _) ||
                    Marshal.GetLastWin32Error() != 0) throw new UnauthorizedAccessException("No se puede preparar la custodia.");
            }
            catch { identity.Dispose(); throw; }
        }
        public void Dispose()
        {
            if (previous.Count != 0) RestoreTokenPrivileges(identity.Token, false, ref previous, 0, 0, 0);
            identity.Dispose();
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct Luid { internal uint Low; internal int High; }
        [StructLayout(LayoutKind.Sequential)]
        private struct Privileges { internal uint Count; internal Luid Luid; internal uint Attributes; }
        // Localiza el privilegio existente del administrador; no concede permisos nuevos.
        [DllImport("advapi32.dll", EntryPoint = "LookupPrivilegeValueW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool LookupPrivilegeValue(string? system, string name, out Luid luid);
        // Activa temporalmente SeRestorePrivilege para asignar propietario SYSTEM; luego restaura su estado.
        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool AdjustTokenPrivileges(nint token, bool disable, ref Privileges state, uint length, out Privileges previous, out uint needed);
        // Restauración sin pedir otra copia del estado previo, para no necesitar buffer de salida.
        [DllImport("advapi32.dll", EntryPoint = "AdjustTokenPrivileges", SetLastError = true)]
        private static extern bool RestoreTokenPrivileges(nint token, bool disable, ref Privileges state, uint length, nint previous, nint needed);
    }
}
