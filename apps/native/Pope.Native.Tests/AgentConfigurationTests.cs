using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using Pope.Agent;
using Xunit;

namespace Pope.Native.Tests;

public sealed class AgentConfigurationTests
{
    internal static Dictionary<string, object> Fixture()
    {
        using var key = RSA.Create(2048);
        var request = new CertificateRequest("CN=localhost", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        var names = new SubjectAlternativeNameBuilder();
        names.AddDnsName("localhost");
        request.CertificateExtensions.Add(names.Build());
        using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddDays(1));
        return new()
        {
            ["version"] = 1,
            ["pcId"] = "01900000-0000-7000-8000-000000000123",
            ["pcName"] = "PC de prueba",
            ["nodeUrl"] = "https://localhost:3000",
            ["nodeCertificate"] = Convert.ToBase64String(certificate.RawData),
            ["credential"] = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
        };
    }

    [Fact(DisplayName = "REQ-003-63: identidad privada y borrado al disponer")]
    public void ValidConfigurationAndDispose()
    {
        var fixture = Fixture();
        using var configuration = AgentConfiguration.Parse(JsonSerializer.SerializeToUtf8Bytes(fixture));
        Assert.Equal("PC de prueba", configuration.PcName);
        Assert.True(configuration.Authorization() == "Bearer " + fixture["credential"]);
        configuration.Dispose();
        Assert.Throws<ObjectDisposedException>(() => configuration.Authorization());
    }

    [Fact(DisplayName = "REQ-003-02/63: configuración corrupta o insegura falla sin mostrar secretos")]
    public void InvalidConfigurationDoesNotDisclose()
    {
        var original = Fixture();
        foreach (var (field, value) in new (string, object)[] { ("version", 2), ("pcId", Guid.NewGuid().ToString()),
            ("pcName", ""), ("nodeUrl", "http://localhost"), ("nodeUrl", "https://usuario:secreto@localhost"),
            ("nodeUrl", "https://localhost/?secret=valor"), ("nodeUrl", "https://otro-nodo"),
            ("pcId", (string)original["pcId"] + "\n"), ("credential", (string)original["credential"] + "\n"),
            ("nodeCertificate", "secreto"), ("credential", "secreto"), ("extra", "secreto") })
        {
            var invalid = new Dictionary<string, object>(original) { [field] = value };
            var error = Assert.Throws<InvalidDataException>(() => AgentConfiguration.Parse(JsonSerializer.SerializeToUtf8Bytes(invalid)));
            Assert.Equal("Configuración del agente no válida.", error.Message);
            Assert.Null(error.InnerException);
        }
        Assert.Throws<InvalidDataException>(() => AgentConfiguration.Parse(new byte[AgentConfiguration.MaximumBytes + 1]));
        Assert.Throws<InvalidDataException>(() => AgentConfiguration.Parse("{"u8.ToArray()));
    }

    [Fact(DisplayName = "REQ-003-63: logs de códigos cerrados rotan sin crecer indefinidamente")]
    public void LogsAreBounded()
    {
        var directory = Path.Combine(Path.GetTempPath(), "pope-log-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try
        {
            var log = new AgentLog(directory);
            File.WriteAllBytes(Path.Combine(directory, "agent.log"), new byte[AgentLog.MaximumBytes + 1]);
            Parallel.For(0, 4000, _ => log.Write(AgentLogCode.TransportDisconnected));
            var files = Directory.GetFiles(directory);
            Assert.Equal(2, files.Length);
            Assert.All(files, path => Assert.InRange(new FileInfo(path).Length, 1, AgentLog.MaximumBytes));
            Assert.Throws<ArgumentOutOfRangeException>(() => log.Write((AgentLogCode)100));
        }
        finally { Directory.Delete(directory, recursive: true); }
    }
}
