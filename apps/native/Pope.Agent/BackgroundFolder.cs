using System.Security.AccessControl;
using System.Security.Principal;

namespace Pope.Agent;

// REQ-003-73 / ADR-0017: la imagen del fondo no es secreta (se ve en pantalla), así que no va
// cifrada ni en la custodia; pero nadie sin privilegios puede cambiarla ni borrarla. SYSTEM y
// administradores: control total; BUILTIN\Users: solo lectura (el host la lee con la cuenta
// del cliente, que aún no existe: la crea el instalador). Sin herencia de ningún padre.
internal static class BackgroundFolder
{
    // SY = SYSTEM, BA = administradores, BU = Users; 0x1200a9 = lectura y ejecución.
    private const string Descriptor = "D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;BU)";
    private static readonly (string Sid, FileSystemRights Rights)[] Expected =
    [
        ("S-1-5-18", FileSystemRights.FullControl),
        ("S-1-5-32-544", FileSystemRights.FullControl),
        // 0x1200a9: .NET no incluye Synchronize en ReadAndExecute, pero Windows lo guarda con él.
        ("S-1-5-32-545", FileSystemRights.ReadAndExecute | FileSystemRights.Synchronize)
    ];

    /// <summary>
    /// Crea la carpeta con sus permisos si no existe y comprueba que son los esperados. El servicio
    /// pide además que el propietario sea SYSTEM; las pruebas, con un usuario normal, no pueden.
    /// </summary>
    internal static void Prepare(string path, bool requireSystemOwner = false)
    {
        var directory = new DirectoryInfo(Path.GetFullPath(path));
        // Antes de crear nada: a través de un enlace se acabaría escribiendo en otro sitio.
        AgentCustody.RejectLinks(directory);
        if (!directory.Exists)
        {
            var security = new DirectorySecurity();
            security.SetSecurityDescriptorSddlForm(Descriptor);
            directory.Create(security);
        }
        Verify(directory, requireSystemOwner);
    }

    /// <summary>Una carpeta con otros permisos no se acepta ni se repara en silencio.</summary>
    internal static void Verify(DirectoryInfo directory, bool requireSystemOwner = false)
    {
        AgentCustody.RejectLinks(directory);
        var security = directory.GetAccessControl();
        if (requireSystemOwner && security.GetOwner(typeof(SecurityIdentifier))?.Value != "S-1-5-18")
            throw new UnauthorizedAccessException("Carpeta de fondos no válida.");
        var rules = security.GetAccessRules(true, true, typeof(SecurityIdentifier)).Cast<FileSystemAccessRule>().ToArray();
        if (!security.AreAccessRulesProtected || rules.Length != Expected.Length ||
            rules.Any(r => r.IsInherited || r.AccessControlType != AccessControlType.Allow ||
                r.InheritanceFlags != (InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit) ||
                r.PropagationFlags != PropagationFlags.None ||
                !Expected.Contains((r.IdentityReference.Value, r.FileSystemRights))))
            throw new UnauthorizedAccessException("Carpeta de fondos no válida.");
    }
}
