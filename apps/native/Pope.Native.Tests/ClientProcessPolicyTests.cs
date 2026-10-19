using Pope.Agent;
using Xunit;

namespace Pope.Native.Tests;

public sealed class ClientProcessPolicyTests
{
    private const string Client = "S-1-5-21-1-2-3-1001";
    private const string Pope = @"C:\Program Files\Pope\Pope.ShellHost.exe";
    private const string WebView = @"C:\Program Files (x86)\Microsoft\EdgeWebView\Application\155.0\msedgewebview2.exe";
    private static readonly ClientScope Scope = new("01900000-0000-7000-8000-000000000124", 1, Client, "S-1-5-5-0-1", Start: 1_000, Boot: 10);

    private static ProcessEntry P(uint pid, long created, uint parent = 0, string image = @"C:\Juegos\juego.exe", string user = Client, uint session = 1, bool critical = false) =>
        new(pid, parent, created, session, user, image, critical);

    [Fact(DisplayName = "REQ-003-34/CA-003-08: cierra lo creado en la sesión y conserva lo anterior, Pope y el sistema")]
    public void SessionWindow()
    {
        var all = new[]
        {
            P(10, 500, image: @"C:\Windows\System32\sihost.exe"),        // del logon: anterior a la sesión
            P(20, 600, image: Pope), P(21, 650, 20, WebView), P(22, 700, 20, Pope), // host, su WebView2 y el hijo de bloqueo
            P(23, 1_500, 21, WebView),                                     // renderer nuevo de Pope durante la sesión
            P(30, 1_100), P(31, 1_200, 30, @"C:\Juegos\anticheat.exe"),     // juego y auxiliar del cliente
            P(32, 1_300, 20, @"C:\Juegos\otro.exe"),                       // app lanzada por Pope: es del cliente
            P(33, 1_400, 30, WebView),                                     // WebView2 de un lanzador: no es de Pope
            P(40, 1_150, user: "S-1-5-18"), P(41, 1_150, session: 0), P(42, 1_150, user: "S-1-5-21-1-2-3-1002"),
            P(43, 1_150, critical: true), new ProcessEntry(44, 0, 1_150, 1, Client, null, false),
        };
        var targets = ClientProcessPolicy.Targets(all, Scope, cutoff: 2_000, [(20, 600)], Pope).Select(t => t.Pid);
        Assert.Equal([30u, 31u, 32u, 33u], targets);
    }

    [Fact(DisplayName = "REQ-003-34: un relanzamiento posterior al corte se cierra; el cliente siguiente no")]
    public void CutoffAndRespawn()
    {
        var all = new[]
        {
            P(30, 1_100, image: @"C:\Steam\steam.exe"),
            P(31, 2_100, 30, @"C:\Steam\steamwebhelper.exe"), P(32, 2_200, 31),   // relanzados por el lanzador cerrado
            P(50, 2_100, 20),                                                      // primer juego del cliente siguiente
            P(51, 2_300, 50),
        };
        var targets = ClientProcessPolicy.Targets(all, Scope, cutoff: 2_000, [], Pope).Select(t => t.Pid);
        Assert.Equal([30u, 31u, 32u], targets);
    }

    [Fact(DisplayName = "REQ-003-34: un PID reutilizado no hereda la pertenencia del proceso cerrado")]
    public void ReusedParentPid()
    {
        var all = new[]
        {
            P(30, 1_100),
            P(60, 2_500, 30),            // hijo legítimo del 30, posterior al corte
            P(61, 900, 30),              // anterior a la sesión: el PID padre coincide, pero no es su hijo
            P(62, 2_600, 99),            // padre desconocido
        };
        var targets = ClientProcessPolicy.Targets(all, Scope, cutoff: 2_000, [], Pope).Select(t => t.Pid);
        Assert.Equal([30u, 60u], targets);
    }

    [Fact(DisplayName = "REQ-003-34: el hijo relanzado de un objetivo ya cerrado se cierra, salvo PID padre reutilizado")]
    public void ChildOfClosedTarget()
    {
        var closed = new[] { P(30, 1_100), P(35, 1_300) };
        var all = new[]
        {
            P(31, 2_100, 30),                 // relanzado por el 30 antes de morir
            P(35, 2_200, 20),                 // el PID 35 ya es de otro proceso (cliente siguiente)
            P(36, 2_300, 35),                 // hijo de ese proceso vivo, no del 35 cerrado
        };
        var targets = ClientProcessPolicy.Targets(all, Scope, cutoff: 2_000, [], Pope, closed).Select(t => t.Pid);
        Assert.Equal([31u], targets);
    }

    [Fact(DisplayName = "REQ-003-34: un host de Pope con PID reutilizado no protege a un proceso ajeno")]
    public void PopeRootNeedsCreationTime()
    {
        var all = new[] { P(20, 1_100, image: Pope), P(21, 1_200, 20, WebView) };
        Assert.Equal([20u, 21u], ClientProcessPolicy.Targets(all, Scope, 2_000, [(20, 600)], Pope).Select(t => t.Pid));
        Assert.Empty(ClientProcessPolicy.Targets(all, Scope, 2_000, [(20, 1_100)], Pope));
    }
}
