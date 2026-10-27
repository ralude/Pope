using System.Net.Security;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

namespace Pope.Agent;

// REQ-003-63: el WebSocket y las descargas hablan con el nodo con el mismo transporte: TLS 1.2/1.3,
// sin redirecciones ni proxy, y únicamente el certificado fijado en la custodia.
internal static class NodeTransport
{
    /// <summary>
    /// Manejador HTTP hacia el nodo. Recibe una función y no la configuración, porque tras una
    /// revocación el agente la sustituye (T34) y la comprobación debe ver siempre la vigente.
    /// </summary>
    internal static SocketsHttpHandler CreateHandler(Func<AgentConfiguration> current)
    {
        var handler = new SocketsHttpHandler();
        handler.SslOptions.EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13;
        handler.SslOptions.RemoteCertificateValidationCallback = (_, certificate, _, errors) => Trusted(current(), certificate, errors);
        handler.AllowAutoRedirect = false;
        handler.UseProxy = false;
        return handler;
    }

    internal static bool Trusted(AgentConfiguration configuration, X509Certificate? certificate, SslPolicyErrors errors)
    {
        if (certificate is null || (errors & (SslPolicyErrors.RemoteCertificateNotAvailable | SslPolicyErrors.RemoteCertificateNameMismatch)) != 0) return false;
        using var received = X509CertificateLoader.LoadCertificate(certificate.GetRawCertData());
        return CryptographicOperations.FixedTimeEquals(received.RawData, configuration.NodeCertificate)
            && received.MatchesHostname(configuration.NodeUrl.DnsSafeHost, allowWildcards: false, allowCommonName: false)
            && DateTime.UtcNow >= received.NotBefore.ToUniversalTime() && DateTime.UtcNow < received.NotAfter.ToUniversalTime();
        // La cadena autofirmada solo se admite para el certificado fijado por medio confiable.
    }
}
