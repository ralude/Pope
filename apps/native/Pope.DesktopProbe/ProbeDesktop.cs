using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;

namespace Pope.DesktopProbe;

internal sealed class ProbeDesktop : IDisposable
{
    private const int StationRights = 0x37; // Enumerar, atributos, portapapeles y átomos; sin EXITWINDOWS/CREATEDESKTOP.
    private readonly SecurityIdentifier logon;
    private readonly nint station;
    private bool granted;
    internal nint Handle { get; private set; }
    internal string Name { get; }

    internal ProbeDesktop(string name, string logonSid)
    {
        Name = name; logon = new SecurityIdentifier(logonSid);
        station = GetProcessWindowStation();
        if (station == 0) throw new Win32Exception();
        try
        {
            var descriptor = Read(station);
            descriptor.DiscretionaryAcl ??= new RawAcl(2, 1);
            ProbeRun.Require(!descriptor.DiscretionaryAcl.OfType<CommonAce>().Any(ace => ace.SecurityIdentifier == logon), "El SID de logon ya tenía una ACE en la estación");
            descriptor.DiscretionaryAcl.InsertAce(descriptor.DiscretionaryAcl.Count, new CommonAce(AceFlags.None, AceQualifier.AccessAllowed, StationRights, logon, false, null));
            Write(station, descriptor); granted = true;
            var bytes = Bytes(new RawSecurityDescriptor($"O:SYG:SYD:P(A;;0x{DesktopNative.DesktopAccess:X};;;SY)(A;;0x{DesktopNative.DesktopAccess:X};;;{logonSid})"));
            var pinned = GCHandle.Alloc(bytes, GCHandleType.Pinned);
            try
            {
                var attributes = new Attributes { Size = Marshal.SizeOf<Attributes>(), Descriptor = pinned.AddrOfPinnedObject() };
                Handle = CreateDesktop(name, null, 0, 0, DesktopNative.DesktopAccess, ref attributes);
                if (Handle == 0) throw new Win32Exception();
            }
            finally { pinned.Free(); }
        }
        catch { Dispose(); throw; }
    }

    public void Dispose()
    {
        if (Handle != 0) { DesktopNative.CloseDesktop(Handle); Handle = 0; }
        if (!granted) return;
        // Relee la ACL actual: conserva cambios concurrentes, quita solo nuestra ACE exacta.
        var descriptor = Read(station);
        var acl = descriptor.DiscretionaryAcl;
        if (acl != null)
            for (var index = acl.Count - 1; index >= 0; index--)
                if (acl[index] is CommonAce ace && ace.SecurityIdentifier == logon && ace.AccessMask == StationRights && ace.AceFlags == AceFlags.None)
                { acl.RemoveAce(index); break; }
        Write(station, descriptor); granted = false;
    }

    private static RawSecurityDescriptor Read(nint handle)
    {
        uint kind = 4;
        GetUserObjectSecurity(handle, ref kind, null, 0, out var length);
        if (length is < 1 or > 65536) throw new Win32Exception();
        var bytes = new byte[length];
        if (!GetUserObjectSecurity(handle, ref kind, bytes, length, out _)) throw new Win32Exception();
        return new RawSecurityDescriptor(bytes, 0);
    }
    private static byte[] Bytes(RawSecurityDescriptor descriptor)
    {
        var bytes = new byte[descriptor.BinaryLength]; descriptor.GetBinaryForm(bytes, 0); return bytes;
    }
    private static void Write(nint handle, RawSecurityDescriptor descriptor)
    {
        uint kind = 4;
        if (!SetUserObjectSecurity(handle, ref kind, Bytes(descriptor))) throw new Win32Exception();
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct Attributes { internal int Size; internal nint Descriptor; internal int Inherit; }
    // Usa la estación interactiva de esta sesión, sin cambiar estaciones del cliente.
    [DllImport("user32.dll")]
    private static extern nint GetProcessWindowStation();
    // Crea el escritorio con DACL SYSTEM/logon; no concede acceso por SID de cuenta.
    [DllImport("user32.dll", EntryPoint = "CreateDesktopW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern nint CreateDesktop(string name, string? device, nint mode, uint flags, uint access, ref Attributes attributes);
    // Lee la ACL real de estación para preservar las ACE ajenas al prototipo.
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetUserObjectSecurity(nint handle, ref uint kind, byte[]? descriptor, uint length, out uint needed);
    // Añade/retira solo permisos propios de este logon, sin reemplazar la ACL por una amplia.
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetUserObjectSecurity(nint handle, ref uint kind, byte[] descriptor);
}
