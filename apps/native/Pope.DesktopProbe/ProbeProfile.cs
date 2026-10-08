using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;

namespace Pope.DesktopProbe;

internal sealed class ProbeProfile : IDisposable
{
    private readonly ProbeToken token;
    private nint loaded;
    internal nint EnvironmentBlock { get; private set; }
    internal string Path { get; }
    internal ProbeProfile(ProbeToken token, bool load)
    {
        this.token = token;
        try
        {
            if (load)
            {
                using var identity = new WindowsIdentity(token.Handle);
                var profile = new Profile { Size = Marshal.SizeOf<Profile>(), Flags = 1, User = identity.Name.Split('\\')[^1] };
                if (!LoadUserProfile(token.Handle, ref profile)) throw new Win32Exception();
                loaded = profile.Handle;
            }
            var buffer = new StringBuilder(1024);
            var length = buffer.Capacity;
            if (!GetUserProfileDirectory(token.Handle, buffer, ref length)) throw new Win32Exception();
            Path = buffer.ToString();
            if (!CreateEnvironmentBlock(out var environment, token.Handle, false)) throw new Win32Exception();
            EnvironmentBlock = environment;
        }
        catch { Dispose(); throw; }
    }
    public void Dispose()
    {
        if (EnvironmentBlock != 0) { DestroyEnvironmentBlock(EnvironmentBlock); EnvironmentBlock = 0; }
        if (loaded != 0)
        {
            var handle = loaded; loaded = 0;
            // Descarga solo la referencia adquirida; nunca borra el perfil existente.
            if (!UnloadUserProfile(token.Handle, handle)) throw new Win32Exception();
        }
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct Profile
    {
        internal int Size, Flags; internal string User; internal string? ProfilePath, DefaultPath, Server, Policy; internal nint Handle;
    }
    // Carga la colmena del usuario autenticado; CreateProcessAsUser no lo hace por sí solo.
    [DllImport("userenv.dll", EntryPoint = "LoadUserProfileW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool LoadUserProfile(nint token, ref Profile information);
    // Retira únicamente nuestra referencia, manteniendo archivos y otras sesiones intactos.
    [DllImport("userenv.dll", SetLastError = true)]
    private static extern bool UnloadUserProfile(nint token, nint profile);
    // Consulta el perfil efectivo según el token, no según el entorno de SYSTEM.
    [DllImport("userenv.dll", EntryPoint = "GetUserProfileDirectoryW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool GetUserProfileDirectory(nint token, StringBuilder path, ref int length);
    // Construye variables del usuario sin heredar USERPROFILE/TEMP del broker.
    [DllImport("userenv.dll", SetLastError = true)]
    private static extern bool CreateEnvironmentBlock(out nint environment, nint token, bool inherit);
    // Libera el bloque de entorno creado por Windows al terminar sus lanzamientos.
    [DllImport("userenv.dll")]
    private static extern bool DestroyEnvironmentBlock(nint environment);
}
