using System.Diagnostics;
using System.IO.Pipes;
using Pope.Bridge;
using Xunit;

namespace Pope.Native.Tests;

public sealed class PipeIdentityTests
{
    [Fact(DisplayName = "REQ-003-63: pipe Windows contrasta PID/sesión retenidos en ambos extremos")]
    public async Task RealPipeIdentity()
    {
        using var current = Process.GetCurrentProcess();
        using var retained = new RetainedProcess(current);
        var name = PipeEndpoints.NewName();
        using var server = PipeEndpoints.Create(name, retained);
        using var cancel = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var waiting = server.WaitForConnectionAsync(cancel.Token);
        using var client = await PipeEndpoints.Connect(name, retained, cancel.Token);
        await waiting;
        Assert.True(PipeEndpoints.IsHost(server, retained));
        Assert.True(PipeEndpoints.IsServer(client, retained));
        Assert.Equal((uint)current.SessionId, retained.Session);
        Assert.False(retained.Matches(retained.Id + 1));
        Assert.Throws<UnauthorizedAccessException>(() => RetainedProcess.ForService(current.Id));
        Assert.ThrowsAny<Exception>(() => PipeEndpoints.Create(name, retained));
        Assert.Equal(0u, PipeEndpoints.HostAccess & 4);
    }

    [Fact(DisplayName = "REQ-003-63: el handle retenido no depende de la vida del objeto Process")]
    public void HandleIsOwned()
    {
        var current = Process.GetCurrentProcess();
        using var retained = new RetainedProcess(current);
        current.Dispose(); Assert.True(retained.Alive); Assert.True(retained.Matches((uint)Environment.ProcessId));
        Assert.Throws<InvalidDataException>(() => PipeEndpoints.ValidateName(@"\\otro\pipe\Pope"));
        Assert.Throws<InvalidDataException>(() => PipeEndpoints.ValidateName("Pope.Shell." + Guid.NewGuid().ToString()));
    }
}
