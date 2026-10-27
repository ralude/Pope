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

    [Fact(DisplayName = "REQ-003-73/63: el host de fondos solo sirve imágenes; no es un origen del Shell ni se puede navegar a él")]
    public void BackgroundHostIsNotAnOrigin()
    {
        Assert.Equal("background.pope.invalid", HostBoundary.BackgroundHost);
        var sha256 = new string('a', 64);
        foreach (var url in new[] { $"https://{HostBoundary.BackgroundHost}/{sha256}.webp", $"https://{HostBoundary.BackgroundHost}/", $"https://{HostBoundary.BackgroundHost}/index.html" })
        {
            // La navegación y los mensajes solo valen para el host del Shell: así `NavigationStarting` lo cancela.
            Assert.False(HostBoundary.Allows(url));
            Assert.Throws<InvalidDataException>(() => HostBoundary.ReadRequest(url, "{\"version\":1,\"kind\":\"ready\"}"));
        }
        // Los dos nombres son distintos, y uno no es prefijo ni sufijo del otro.
        Assert.NotEqual(HostBoundary.HostName, HostBoundary.BackgroundHost);
        Assert.False(HostBoundary.Allows($"https://{HostBoundary.HostName}.{HostBoundary.BackgroundHost}/"));
    }
}
