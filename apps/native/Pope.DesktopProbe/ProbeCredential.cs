using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;

namespace Pope.DesktopProbe;

// Solo laboratorio T10 · REQ-003-40/43. No recibe órdenes del nodo ni del Shell.
internal static class ProbeCredential
{
    internal static string Root(string id) => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "PopeMaintenanceProbe-" + Guid.ParseExact(id, "N").ToString("N"));

    internal static int Configure(string id)
    {
        if (!DesktopNative.Elevated()) throw new InvalidOperationException("La configuración exige elevación local");
        var root = Root(id);
        if (Directory.Exists(root)) throw new IOException("Usa un identificador de ensayo nuevo");
        var user = new StringBuilder(260);
        var password = new StringBuilder(256);
        var info = new CredentialInfo
        {
            Size = Marshal.SizeOf<CredentialInfo>(),
            Caption = "Pope · Credencial privada T10",
            Message = "Cuenta administradora LOCAL existente (EQUIPO\\usuario). Solo VM de pruebas."
        };
        var save = false;
        var result = Prompt(ref info, "PopeMaintenanceProbe", 0, 0, user, user.Capacity, password, password.Capacity,
            ref save, 0x40082);
        if (result == 1223) return 2;
        if (result != 0) throw new Win32Exception(result);
        var chars = new char[user.Length + password.Length + 2];
        byte[]? plain = null;
        try
        {
            user.CopyTo(0, chars, 0, user.Length);
            password.CopyTo(0, chars, user.Length + 1, password.Length);
            plain = Encoding.Unicode.GetBytes(chars);
            var encrypted = Transform(plain, protect: true);
            // Propietario SYSTEM: el token medio de la misma cuenta no recupera WRITE_DAC.
            ProbePrivilege.Enable("SeRestorePrivilege");
            CreateDirectory(root, administrators: true);
            File.WriteAllBytes(Path.Combine(root, "pending.bin"), encrypted);
            new FileInfo(Path.Combine(root, "pending.bin")).SetAccessControlCompat(administrators: true);
            return 0;
        }
        finally
        {
            Array.Clear(chars);
            if (plain != null) CryptographicOperations.ZeroMemory(plain);
            password.Clear();
            // Sobrescribe el buffer del prompt; la credencial no se registra ni persiste plana.
            password.Append('\0', password.Capacity - 1); password.Clear();
        }
    }

    internal static void Import(string id)
    {
        RequireSystem();
        var root = Root(id);
        var pending = Path.Combine(root, "pending.bin");
        var blob = File.ReadAllBytes(pending);
        if (blob.Length is < 16 or > 16384) throw new InvalidDataException("Credencial protegida fuera de límites");
        using (OpenBlob(blob)) { } // Rechaza un blob corrupto antes de reemplazar el anterior.
        var target = Path.Combine(root, "Maintenance");
        if (!Directory.Exists(target)) CreateDirectory(target, administrators: false);
        var temporary = Path.Combine(target, Guid.NewGuid().ToString("N") + ".tmp");
        try
        {
            File.WriteAllBytes(temporary, blob);
            new FileInfo(temporary).SetAccessControlCompat(administrators: false);
            File.Move(temporary, Path.Combine(target, "credential.bin"), overwrite: true);
            File.Delete(pending);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }

    internal static CredentialBuffer Read(string id)
    {
        RequireSystem();
        return OpenBlob(File.ReadAllBytes(Path.Combine(Root(id), "Maintenance", "credential.bin")));
    }

    internal static object Verify(string id)
    {
        RequireSystem();
        var root = Root(id);
        var path = Path.Combine(root, "Maintenance", "credential.bin");
        var original = File.ReadAllBytes(path);
        var damaged = original.ToArray(); damaged[0] ^= 255;
        var pending = Path.Combine(root, "pending.bin");
        try
        {
            File.WriteAllBytes(pending, damaged);
            try { Import(id); throw new InvalidOperationException("Aceptó reemplazo corrupto"); }
            catch (Win32Exception) { }
            ProbeRun.Require(File.ReadAllBytes(path).SequenceEqual(original), "Reemplazo fallido alteró el blob anterior");
            File.WriteAllBytes(pending, original); Import(id);
            ProbeRun.Require(File.ReadAllBytes(path).SequenceEqual(original), "Reemplazo válido no conservó el blob");
            var fileAcl = new FileInfo(path).GetAccessControl().GetSecurityDescriptorSddlForm(AccessControlSections.All);
            var folderAcl = new DirectoryInfo(Path.GetDirectoryName(path)!).GetAccessControl().GetSecurityDescriptorSddlForm(AccessControlSections.All);
            foreach (var acl in new[] { fileAcl, folderAcl })
            {
                var descriptor = new RawSecurityDescriptor(acl);
                ProbeRun.Require(descriptor.Owner!.Value == "S-1-5-18" && descriptor.DiscretionaryAcl!.Count == 1 &&
                    descriptor.DiscretionaryAcl[0] is CommonAce ace && ace.SecurityIdentifier.Value == "S-1-5-18", "Custodia sin propietario/ACL exclusiva SYSTEM");
            }
            return new { FileAcl = fileAcl, FolderAcl = folderAcl, ReplacementPassed = true };
        }
        finally { if (File.Exists(pending)) File.Delete(pending); }
    }

    internal static void Clean(string id)
    {
        RequireSystem();
        var root = Root(id);
        var directory = Path.Combine(root, "Maintenance");
        var file = Path.Combine(directory, "credential.bin");
        if (File.Exists(file)) File.Delete(file);
        if (Directory.Exists(directory)) Directory.Delete(directory);
        var pending = Path.Combine(root, "pending.bin");
        if (File.Exists(pending)) File.Delete(pending);
    }

    private static CredentialBuffer OpenBlob(byte[] blob) => new(Transform(blob, protect: false));
    internal static int Check()
    {
        // Fixture público: demuestra DPAPI y el formato sin configurar ninguna cuenta.
        var plain = Encoding.Unicode.GetBytes("PopeFixture\0Contraseña ficticia\0");
        try
        {
            var blob = Transform(plain, protect: true);
            using var restored = OpenBlob(blob);
            ProbeRun.Require(Marshal.PtrToStringUni(restored.User) == "PopeFixture", "DPAPI no conservó el usuario");
            ProbeRun.Require(Marshal.PtrToStringUni(restored.Password) == "Contraseña ficticia", "DPAPI no conservó la fixture");
            blob[0] ^= 255;
            try { using var unexpected = OpenBlob(blob); throw new InvalidOperationException("DPAPI aceptó un blob corrupto"); }
            catch (Win32Exception) { }
            using var identity = WindowsIdentity.GetCurrent();
            if (!identity.IsSystem)
            {
                try { using var unexpected = Read(Guid.NewGuid().ToString("N")); throw new IOException("Permitió custodia fuera de SYSTEM"); }
                catch (InvalidOperationException) { }
            }
            Console.WriteLine("T10 · REQ-003-40/43: DPAPI, Unicode, corrupción y frontera SYSTEM comprobados; ACL en VM pendiente");
            return 0;
        }
        finally { CryptographicOperations.ZeroMemory(plain); }
    }
    private static void RequireSystem()
    {
        using var identity = WindowsIdentity.GetCurrent();
        if (!identity.IsSystem) throw new InvalidOperationException("Custodia accesible solo al broker SYSTEM");
    }

    private static void CreateDirectory(string path, bool administrators)
    {
        var security = new DirectorySecurity();
        security.SetSecurityDescriptorSddlForm(Descriptor(administrators, directory: true));
        new DirectoryInfo(path).Create(security);
    }

    private static string Descriptor(bool administrators, bool directory) =>
        "O:SYG:SYD:P(A;" + (directory ? "OICI" : "") + ";FA;;;SY)" +
        (administrators ? "(A;" + (directory ? "OICI" : "") + ";FA;;;BA)" : "");

    private static void SetAccessControlCompat(this FileInfo file, bool administrators)
    {
        var security = new FileSecurity();
        security.SetSecurityDescriptorSddlForm(Descriptor(administrators, directory: false));
        file.SetAccessControl(security);
    }

    private static byte[] Transform(byte[] input, bool protect)
    {
        var pinned = GCHandle.Alloc(input, GCHandleType.Pinned);
        var data = new Blob { Size = input.Length, Data = pinned.AddrOfPinnedObject() };
        var output = new Blob();
        try
        {
            var ok = protect ? Protect(ref data, null, 0, 0, 0, 5, out output) : Unprotect(ref data, 0, 0, 0, 0, 1, out output);
            if (!ok) throw new Win32Exception();
            if (output.Size is < 1 or > 16384) throw new InvalidDataException("DPAPI devolvió un tamaño no admitido");
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
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CredentialInfo { internal int Size; internal nint Parent; internal string Message, Caption; internal nint Banner; }
    // Prompt nativo privado, sin guardado en el administrador de credenciales ni WebView2.
    [DllImport("credui.dll", EntryPoint = "CredUIPromptForCredentialsW", CharSet = CharSet.Unicode)]
    private static extern int Prompt(ref CredentialInfo info, string target, nint reserved, int error, StringBuilder user, int userLength,
        StringBuilder password, int passwordLength, ref bool save, uint flags);
    // DPAPI de máquina con UI prohibida; la DACL SYSTEM aporta el control de lectura.
    [DllImport("crypt32.dll", EntryPoint = "CryptProtectData", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool Protect(ref Blob input, string? description, nint entropy, nint reserved, nint prompt, uint flags, out Blob output);
    // Descifra únicamente dentro del broker; no exporta la credencial a otros procesos.
    [DllImport("crypt32.dll", EntryPoint = "CryptUnprotectData", SetLastError = true)]
    private static extern bool Unprotect(ref Blob input, nint description, nint entropy, nint reserved, nint prompt, uint flags, out Blob output);
    // Libera el buffer de DPAPI después de borrarlo explícitamente.
    [DllImport("kernel32.dll")]
    private static extern nint LocalFree(nint memory);

    internal sealed class CredentialBuffer : IDisposable
    {
        private readonly byte[] bytes;
        private GCHandle pinned;
        internal nint User { get; }
        internal nint Password { get; }
        internal CredentialBuffer(byte[] bytes)
        {
            this.bytes = bytes;
            try
            {
                if (bytes.Length % 2 != 0 || bytes.Length is < 6 or > 2048 || bytes[^1] != 0 || bytes[^2] != 0)
                    throw new InvalidDataException("Formato de credencial no admitido");
                var separator = -1;
                for (var index = 0; index < bytes.Length - 2; index += 2)
                    if (bytes[index] == 0 && bytes[index + 1] == 0) { separator = index; break; }
                if (separator <= 0 || separator + 4 > bytes.Length) throw new InvalidDataException("Credencial incompleta");
                pinned = GCHandle.Alloc(bytes, GCHandleType.Pinned);
                User = pinned.AddrOfPinnedObject(); Password = User + separator + 2;
            }
            catch { CryptographicOperations.ZeroMemory(bytes); throw; }
        }
        public void Dispose() { CryptographicOperations.ZeroMemory(bytes); if (pinned.IsAllocated) pinned.Free(); }
    }
}
