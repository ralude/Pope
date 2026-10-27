using System.Diagnostics;
using System.Security.AccessControl;
using System.Security.Principal;
using Pope.Agent;
using Xunit;

namespace Pope.Native.Tests;

public sealed class BackgroundFolderTests : IDisposable
{
    private const string System = "S-1-5-18", Administrators = "S-1-5-32-544", Users = "S-1-5-32-545";
    private readonly string root = Path.Combine(Path.GetTempPath(), "pope-folder-" + Guid.NewGuid().ToString("N"));

    public BackgroundFolderTests() => Directory.CreateDirectory(root);

    // La carpeta de fondos no da control a quien la crea (en producción, SYSTEM): la prueba, que corre
    // con un usuario normal, se devuelve el control con su derecho de propietario antes de borrarla.
    public void Dispose()
    {
        var top = new DirectoryInfo(root);
        Unlock(top, WindowsIdentity.GetCurrent().User!);
        // Primero las uniones, sin recursión: así se borra el enlace y no se entra en su destino.
        foreach (var junction in top.EnumerateDirectories().Where(d => (d.Attributes & FileAttributes.ReparsePoint) != 0))
            junction.Delete();
        Directory.Delete(root, recursive: true);
    }

    // Devuelve el control a la prueba en cada carpeta, sin seguir las uniones (borrar una unión no
    // toca su destino, que se desbloquea por su propio camino).
    private static void Unlock(DirectoryInfo folder, SecurityIdentifier me)
    {
        if ((folder.Attributes & FileAttributes.ReparsePoint) != 0) return;
        var security = new DirectorySecurity();
        security.AddAccessRule(new FileSystemAccessRule(me, FileSystemRights.FullControl,
            InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        folder.SetAccessControl(security);
        foreach (var child in folder.EnumerateDirectories()) Unlock(child, me);
    }

    // Una unión de directorio (mklink /J): no pide administrador, a diferencia de un enlace simbólico.
    private static void Junction(string link, string target)
    {
        using var process = Process.Start(new ProcessStartInfo("cmd.exe", $"/c mklink /J \"{link}\" \"{target}\"")
        { CreateNoWindow = true, UseShellExecute = false, RedirectStandardOutput = true })!;
        process.WaitForExit();
        Assert.Equal(0, process.ExitCode);
    }

    private static (string Sid, AccessControlType Type, FileSystemRights Rights, bool Inherited)[] Rules(string path) =>
        new DirectoryInfo(path).GetAccessControl().GetAccessRules(true, true, typeof(SecurityIdentifier)).Cast<FileSystemAccessRule>()
            .Select(r => (r.IdentityReference.Value, r.AccessControlType, r.FileSystemRights, r.IsInherited))
            .OrderBy(r => r.Value, StringComparer.Ordinal).ToArray();

    [Fact(DisplayName = "REQ-003-73/ADR-0017: la carpeta de fondos se crea con SYSTEM y administradores en control total, Users solo lectura y DACL protegida")]
    public void CreatesFolderWithExpectedPermissions()
    {
        var path = Path.Combine(root, "Background");

        BackgroundFolder.Prepare(path);

        Assert.True(new DirectoryInfo(path).GetAccessControl().AreAccessRulesProtected);
        Assert.Equal(
            [
                (System, AccessControlType.Allow, FileSystemRights.FullControl, false),
                (Administrators, AccessControlType.Allow, FileSystemRights.FullControl, false),
                // Lectura y ejecución como la guarda Windows: 0x1200a9, que incluye Synchronize.
                (Users, AccessControlType.Allow, (FileSystemRights)0x1200a9, false)
            ],
            Rules(path));
        // Preparar una carpeta ya preparada no la cambia ni falla.
        BackgroundFolder.Prepare(path);
        Assert.Equal(3, Rules(path).Length);
    }

    [Fact(DisplayName = "REQ-003-63/73: el servicio exige propietario SYSTEM; sin pedirlo (pruebas, usuario normal) no se exige")]
    public void RequiresSystemOwnerOnlyWhenAsked()
    {
        // Como SYSTEM sí sería el propietario: esta prueba solo tiene sentido con otro usuario.
        if (WindowsIdentity.GetCurrent().IsSystem) return;
        var path = Path.Combine(root, "Background");
        BackgroundFolder.Prepare(path);
        var directory = new DirectoryInfo(path);

        BackgroundFolder.Verify(directory);
        BackgroundFolder.Verify(directory, requireSystemOwner: false);
        // El propietario es quien la creó, no SYSTEM: con la exigencia del servicio se rechaza.
        Assert.Throws<UnauthorizedAccessException>(() => BackgroundFolder.Verify(directory, requireSystemOwner: true));
        Assert.Throws<UnauthorizedAccessException>(() => BackgroundFolder.Prepare(path, requireSystemOwner: true));
    }

    [Fact(DisplayName = "REQ-003-63/73: ni la carpeta de fondos ni su camino pueden ser un enlace")]
    public void RejectsLinks()
    {
        var real = Directory.CreateDirectory(Path.Combine(root, "real")).FullName;
        BackgroundFolder.Prepare(Path.Combine(real, "Background"));

        // La propia carpeta es una unión hacia una carpeta que sí tiene los permisos buenos.
        var link = Path.Combine(root, "enlace");
        Junction(link, Path.Combine(real, "Background"));
        Assert.Throws<UnauthorizedAccessException>(() => BackgroundFolder.Prepare(link));
        Assert.Throws<UnauthorizedAccessException>(() => BackgroundFolder.Verify(new DirectoryInfo(link)));

        // Un tramo del camino es una unión: ...\padre\Background acabaría escribiendo en otro sitio.
        var parentLink = Path.Combine(root, "padre");
        Junction(parentLink, real);
        Assert.Throws<UnauthorizedAccessException>(() => BackgroundFolder.Prepare(Path.Combine(parentLink, "Background")));
        // Y tampoco se crea nada nuevo a través de ella.
        Assert.Throws<UnauthorizedAccessException>(() => BackgroundFolder.Prepare(Path.Combine(parentLink, "Otra")));
        Assert.False(Directory.Exists(Path.Combine(real, "Otra")));
    }

    [Fact(DisplayName = "REQ-003-73/ADR-0017: una carpeta con permisos distintos de los esperados no se acepta ni se repara")]
    public void RejectsFolderWithOtherPermissions()
    {
        // Una carpeta ordinaria hereda los permisos de su padre.
        var ordinary = Directory.CreateDirectory(Path.Combine(root, "Ordinaria")).FullName;
        Assert.Throws<UnauthorizedAccessException>(() => BackgroundFolder.Prepare(ordinary));

        // Una carpeta correcta a la que se le da escritura a Users.
        var writable = Path.Combine(root, "Escribible");
        BackgroundFolder.Prepare(writable);
        var security = new DirectoryInfo(writable).GetAccessControl();
        security.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(Users), FileSystemRights.Write,
            InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        new DirectoryInfo(writable).SetAccessControl(security);
        Assert.Throws<UnauthorizedAccessException>(() => BackgroundFolder.Verify(new DirectoryInfo(writable)));

        // Una carpeta correcta cuya DACL vuelve a heredar del padre.
        var inheriting = Path.Combine(root, "Heredera");
        BackgroundFolder.Prepare(inheriting);
        var open = new DirectoryInfo(inheriting).GetAccessControl();
        open.SetAccessRuleProtection(isProtected: false, preserveInheritance: true);
        new DirectoryInfo(inheriting).SetAccessControl(open);
        Assert.Throws<UnauthorizedAccessException>(() => BackgroundFolder.Verify(new DirectoryInfo(inheriting)));
    }
}
