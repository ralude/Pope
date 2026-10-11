using System.Security.Cryptography;
using System.Security.Principal;
using Pope.Agent;
using Xunit;

namespace Pope.Native.Tests;

public sealed class AgentCustodyTests
{
    [Fact(DisplayName = "REQ-003-63: DPAPI conserva bytes, rechaza corrupción y no produce texto plano")]
    public void MachineProtection()
    {
        var input = RandomNumberGenerator.GetBytes(256);
        var encrypted = AgentCustody.Transform(input, protect: true);
        var restored = AgentCustody.Transform(encrypted, protect: false);
        try
        {
            Assert.True(input.SequenceEqual(restored));
            Assert.False(input.SequenceEqual(encrypted));
            encrypted[0] ^= 255;
            Assert.Throws<InvalidDataException>(() => AgentCustody.Transform(encrypted, protect: false));
            Assert.Throws<InvalidDataException>(() => AgentCustody.Transform(new byte[131_073], protect: false));
        }
        finally { CryptographicOperations.ZeroMemory(input); CryptographicOperations.ZeroMemory(restored); }
    }

    [Fact(DisplayName = "REQ-003-63: custodia no accesible desde token medio ni fuera de SYSTEM")]
    public void ApiRequiresServiceOrAdministrator()
    {
        using var identity = WindowsIdentity.GetCurrent();
        var root = Path.Combine(Path.GetTempPath(), "pope-no-custody-" + Guid.NewGuid().ToString("N"));
        if (!identity.IsSystem) Assert.Throws<UnauthorizedAccessException>(() => AgentCustody.Read(root));
        if (!identity.IsSystem && !new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator))
            Assert.Throws<UnauthorizedAccessException>(() => AgentCustody.Store(root, []));
        Assert.False(Directory.Exists(root));
    }

    [Fact(DisplayName = "REQ-003-63: ACL/propietario ordinarios no se aceptan como custodia")]
    public void OrdinaryDirectoryIsRejected()
    {
        var root = Path.Combine(Path.GetTempPath(), "pope-ordinary-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try { Assert.Throws<UnauthorizedAccessException>(() => AgentCustody.Verify(new DirectoryInfo(root))); }
        finally { Directory.Delete(root); }
    }
}
