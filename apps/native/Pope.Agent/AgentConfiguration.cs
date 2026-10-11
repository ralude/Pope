using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Pope.Agent;

// REQ-003-02/63: solo identidad/transporte; no contiene tarifas ni decisiones de cobro.
internal sealed class AgentConfiguration : IDisposable
{
    internal const int MaximumBytes = 65_536;
    private static readonly HashSet<string> Fields = ["version", "pcId", "pcName", "nodeUrl", "nodeCertificate", "credential"];
    private readonly byte[] credential;
    private bool disposed;
    internal string PcId { get; }
    internal string PcName { get; }
    internal Uri NodeUrl { get; }
    internal byte[] NodeCertificate { get; }

    private AgentConfiguration(string id, string name, Uri url, byte[] certificate, byte[] credential)
    {
        PcId = id; PcName = name; NodeUrl = url; NodeCertificate = certificate; this.credential = credential;
    }

    internal string Authorization()
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        return "Bearer " + Convert.ToBase64String(credential).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    internal static AgentConfiguration Parse(byte[] bytes)
    {
        byte[]? secret = null;
        try
        {
            if (bytes.Length is < 1 or > MaximumBytes) throw new InvalidDataException();
            using var document = JsonDocument.Parse(bytes, new JsonDocumentOptions { MaxDepth = 8 });
            var root = document.RootElement;
            var properties = root.EnumerateObject().Select(p => p.Name).ToArray();
            if (properties.Length != Fields.Count || properties.Distinct().Count() != Fields.Count ||
                properties.Any(p => !Fields.Contains(p)) || root.GetProperty("version").GetInt32() != 1)
                throw new InvalidDataException();
            var id = root.GetProperty("pcId").GetString()!;
            if (id.Length != 36 || !Regex.IsMatch(id, "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"))
                throw new InvalidDataException();
            var name = root.GetProperty("pcName").GetString()!;
            if (string.IsNullOrEmpty(name)) throw new InvalidDataException();
            var url = new Uri(root.GetProperty("nodeUrl").GetString()!, UriKind.Absolute);
            if (url.Scheme != Uri.UriSchemeHttps || url.UserInfo.Length != 0 || url.Query.Length != 0 ||
                url.Fragment.Length != 0 || url.AbsolutePath != "/") throw new InvalidDataException();
            var certificate = Convert.FromBase64String(root.GetProperty("nodeCertificate").GetString()!);
            if (certificate.Length is < 1 or > 16_384) throw new InvalidDataException();
            using var cert = X509CertificateLoader.LoadCertificate(certificate);
            if (DateTime.UtcNow < cert.NotBefore.ToUniversalTime() || DateTime.UtcNow >= cert.NotAfter.ToUniversalTime())
                throw new InvalidDataException();
            if (!cert.MatchesHostname(url.DnsSafeHost, allowWildcards: false, allowCommonName: false))
                throw new InvalidDataException();
            var encoded = root.GetProperty("credential").GetString()!;
            if (encoded.Length != 43 || !Regex.IsMatch(encoded, "^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$")) throw new InvalidDataException();
            secret = Convert.FromBase64String(encoded.Replace('-', '+').Replace('_', '/') + "=");
            return new AgentConfiguration(id, name, url, certificate, secret);
        }
        catch
        {
            if (secret != null) CryptographicOperations.ZeroMemory(secret);
            // No conservar excepción interna ni JSON: pueden contener la credencial.
            throw new InvalidDataException("Configuración del agente no válida.");
        }
    }

    public void Dispose()
    {
        CryptographicOperations.ZeroMemory(credential);
        disposed = true;
    }
}
