using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Pope.Bridge;

namespace Pope.ShellHost;

internal static class HostBoundary
{
    internal const string HostName = "shell.pope.invalid";
    internal const string Home = "https://shell.pope.invalid/index.html";
    internal static bool Allows(string source) => Uri.TryCreate(source, UriKind.Absolute, out var uri)
        && uri.Scheme == "https" && uri.Host == HostName && uri.IsDefaultPort && uri.UserInfo.Length == 0;

    internal static void RequireInteractiveUser()
    {
        using var identity = WindowsIdentity.GetCurrent();
        if (identity.IsSystem || Process.GetCurrentProcess().SessionId == 0
            || !GetTokenInformation(identity.Token, 20, out var elevated, sizeof(int), out _) || elevated != 0)
            throw new UnauthorizedAccessException("El Shell exige usuario interactivo sin elevación.");
    }

    internal static JsonElement ReadRequest(string source, string json)
    {
        if (!Allows(source) || Encoding.UTF8.GetByteCount(json) > 16_384)
            throw new InvalidDataException("Mensaje del Shell no válido.");
        var bytes = Encoding.UTF8.GetBytes(json);
        try { return ProtocolValidation.Parse(bytes, "bridge-request"); }
        finally { CryptographicOperations.ZeroMemory(bytes); }
    }

    // TOKEN_ELEVATION: impide crear WebView2 con token alto; no cambia UAC ni privilegios.
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool GetTokenInformation(nint token, int kind, out int value, int size, out int needed);
}
