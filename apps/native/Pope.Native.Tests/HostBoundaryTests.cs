using Pope.ShellHost;
using Xunit;

namespace Pope.Native.Tests;

public sealed class HostBoundaryTests
{
    [Fact(DisplayName = "REQ-003-63: mensaje falso o privilegiado no cruza el origen del Shell")]
    public void RejectsSpoofedOrigin()
    {
        foreach (var source in new[] { "http://shell.pope.invalid/", "https://shell.pope.invalid.evil/", "https://shell.pope.invalid:444/", "https://user@shell.pope.invalid/", "file:///C:/index.html", "data:text/html,test", "https://127.0.0.1/" })
            Assert.Throws<InvalidDataException>(() => HostBoundary.ReadRequest(source, "{\"version\":1,\"kind\":\"ready\"}"));
        Assert.Equal("ready", HostBoundary.ReadRequest(HostBoundary.Home, "{\"version\":1,\"kind\":\"ready\"}").GetProperty("kind").GetString());
        Assert.Throws<InvalidDataException>(() => HostBoundary.ReadRequest(HostBoundary.Home, "{\"version\":1,\"kind\":\"request\",\"request\":{\"type\":\"hello\"}}"));
        Assert.Throws<InvalidDataException>(() => HostBoundary.ReadRequest(HostBoundary.Home, "{\"version\":1,\"kind\":\"ready\",\"credential\":\"secret\"}"));
        Assert.Throws<InvalidDataException>(() => HostBoundary.ReadRequest(HostBoundary.Home, new string(' ', 16_385)));
    }
}
